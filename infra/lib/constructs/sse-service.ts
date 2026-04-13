import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as logs from "aws-cdk-lib/aws-logs";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import type { Construct } from "constructs";

export interface SseServiceProps {
  readonly vpc: ec2.IVpc;
  readonly redisUrl: string;
  readonly deliveryBlogsTable: dynamodb.ITable;
  readonly deliveryUpdatesTable: dynamodb.ITable;
  readonly deliveryChatMessagesTable: dynamodb.ITable;
  readonly eventBus: events.IEventBus;
  readonly environment: string;
}

/**
 * ECS Fargate service behind an ALB, serving long-lived SSE + WebSocket connections.
 * Only needs delivery context tables (read-only for GET endpoints and chat).
 */
export class SseService extends cdk.Resource {
  public readonly loadBalancerDnsName: string;
  public readonly securityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: SseServiceProps) {
    super(scope, id);

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc: props.vpc,
      clusterName: `bbtg-news-${props.environment}-sse`,
    });

    const taskSg = new ec2.SecurityGroup(this, "TaskSg", {
      vpc: props.vpc,
      description: "Security group for ECS SSE tasks",
      allowAllOutbound: true,
    });
    this.securityGroup = taskSg;

    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    const logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `/ecs/bbtg-news-${props.environment}-sse`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const container = taskDef.addContainer("api", {
      image: ecs.ContainerImage.fromAsset(
        path.join(__dirname, "../../.."),
        { file: "apps/api/Dockerfile", platform: Platform.LINUX_AMD64 },
      ),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "sse",
        logGroup,
      }),
      environment: {
        NODE_ENV: "production",
        PORT: "3001",
        REDIS_URL: props.redisUrl,
        // ECS serves delivery reads + SSE/WS — no editorial tables needed
        DELIVERY_BLOGS_TABLE: props.deliveryBlogsTable.tableName,
        DELIVERY_UPDATES_TABLE: props.deliveryUpdatesTable.tableName,
        DELIVERY_CHAT_MESSAGES_TABLE: props.deliveryChatMessagesTable.tableName,
        // ECS doesn't do editorial writes, but the Express app validates all
        // env vars at startup. Set these to the delivery tables since ECS
        // only handles GET/SSE/WS traffic via ALB routing.
        EDITORIAL_ARTICLES_TABLE: "unused-ecs-editorial-articles",
        EDITORIAL_BLOGS_TABLE: "unused-ecs-editorial-blogs",
        EDITORIAL_UPDATES_TABLE: "unused-ecs-editorial-updates",
        DELIVERY_ARTICLES_TABLE: "unused-ecs-delivery-articles",
        EVENT_PUBLISHER: "eventbridge",
        EVENTBRIDGE_BUS_NAME: props.eventBus.eventBusName,
        ALLOWED_ORIGIN: "*",
        AWS_REGION: cdk.Stack.of(this).region,
      },
      portMappings: [{ containerPort: 3001 }],
    });

    // Grant delivery tables read/write (chat writes to delivery-chat-messages)
    props.deliveryBlogsTable.grantReadData(taskDef.taskRole);
    props.deliveryUpdatesTable.grantReadData(taskDef.taskRole);
    props.deliveryChatMessagesTable.grantReadWriteData(taskDef.taskRole);

    // Grant EventBridge put access
    props.eventBus.grantPutEventsTo(taskDef.taskRole);

    const alb = new elb.ApplicationLoadBalancer(this, "Alb", {
      vpc: props.vpc,
      internetFacing: true,
      idleTimeout: cdk.Duration.seconds(300),
    });

    const listener = alb.addListener("HttpListener", {
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
    });

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: false,
      securityGroups: [taskSg],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    listener.addTargets("EcsTargets", {
      port: 3001,
      protocol: elb.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: "/health",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    this.loadBalancerDnsName = alb.loadBalancerDnsName;
  }
}
