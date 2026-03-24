import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

export interface SseServiceProps {
  readonly vpc: ec2.IVpc;
  readonly redisUrl: string;
  readonly articlesTable: dynamodb.ITable;
  readonly blogsTable: dynamodb.ITable;
  readonly updatesTable: dynamodb.ITable;
  readonly eventBus: events.IEventBus;
  readonly environment: string;
}

/**
 * ECS Fargate service behind an ALB, serving long-lived SSE connections.
 * The ALB idle timeout is set to 300 s to keep SSE streams alive.
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

    // Security group for the Fargate tasks
    const taskSg = new ec2.SecurityGroup(this, "TaskSg", {
      vpc: props.vpc,
      description: "Security group for ECS SSE tasks",
      allowAllOutbound: true,
    });
    this.securityGroup = taskSg;

    // Task definition
    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    const logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `/ecs/bbtg-news-${props.environment}-sse`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Build the Docker image from the repo root using the API Dockerfile
    const container = taskDef.addContainer("api", {
      image: ecs.ContainerImage.fromAsset(
        path.join(__dirname, "../../.."),
        { file: "apps/api/Dockerfile" },
      ),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "sse",
        logGroup,
      }),
      environment: {
        NODE_ENV: "production",
        PORT: "3001",
        REDIS_URL: props.redisUrl,
        ARTICLES_TABLE: props.articlesTable.tableName,
        BLOGS_TABLE: props.blogsTable.tableName,
        UPDATES_TABLE: props.updatesTable.tableName,
        EVENT_PUBLISHER: "eventbridge",
        EVENTBRIDGE_BUS_NAME: props.eventBus.eventBusName,
        ALLOWED_ORIGIN: "*",
        AWS_REGION: cdk.Stack.of(this).region,
      },
      portMappings: [{ containerPort: 3001 }],
    });

    // Grant DynamoDB access via the task role
    props.articlesTable.grantReadWriteData(taskDef.taskRole);
    props.blogsTable.grantReadWriteData(taskDef.taskRole);
    props.updatesTable.grantReadWriteData(taskDef.taskRole);

    // Grant EventBridge put access
    props.eventBus.grantPutEventsTo(taskDef.taskRole);

    // ALB — public facing, HTTP only (add ACM cert + HTTPS in production)
    const alb = new elb.ApplicationLoadBalancer(this, "Alb", {
      vpc: props.vpc,
      internetFacing: true,
      // 300 s idle timeout so SSE streams aren't dropped prematurely.
      // The Express keepalive interval (30 s) keeps the connection active
      // below this threshold.
      idleTimeout: cdk.Duration.seconds(300),
    });

    const listener = alb.addListener("HttpListener", {
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
    });

    // Fargate service
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
      // Short deregistration delay so rolling deploys finish quickly.
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    this.loadBalancerDnsName = alb.loadBalancerDnsName;
  }
}
