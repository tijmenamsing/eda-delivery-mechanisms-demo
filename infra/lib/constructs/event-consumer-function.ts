import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import type { Construct } from "constructs";

export interface EventConsumerFunctionProps {
  readonly vpc: ec2.IVpc;
  readonly eventBus: events.IEventBus;
  readonly redisUrl: string;
  readonly deliveryArticlesTable: dynamodb.ITable;
  readonly deliveryBlogsTable: dynamodb.ITable;
  readonly deliveryUpdatesTable: dynamodb.ITable;
  readonly environment: string;
}

/**
 * Consumer Lambda — bridges EventBridge → Delivery context.
 * Handles all three event types:
 * - ArticlePublished → materialize into delivery-articles
 * - UpdatePosted → materialize into delivery-updates + XADD to Redis Stream
 * - BlogClosed → update delivery-blogs status + Redis pub/sub for WS teardown
 */
export class EventConsumerFunction extends cdk.Resource {
  public readonly function: lambda.IFunction;
  public readonly securityGroup: ec2.ISecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    props: EventConsumerFunctionProps,
  ) {
    super(scope, id);

    const sg = new ec2.SecurityGroup(this, "Sg", {
      vpc: props.vpc,
      description: "Security group for event consumer Lambda",
      allowAllOutbound: true,
    });
    this.securityGroup = sg;

    const fn = new lambdaNode.NodejsFunction(this, "Handler", {
      entry: path.join(__dirname, "../lambdas/event-consumer.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [sg],
      environment: {
        NODE_ENV: "production",
        REDIS_URL: props.redisUrl,
        DELIVERY_ARTICLES_TABLE: props.deliveryArticlesTable.tableName,
        DELIVERY_BLOGS_TABLE: props.deliveryBlogsTable.tableName,
        DELIVERY_UPDATES_TABLE: props.deliveryUpdatesTable.tableName,
      },
      bundling: {
        format: lambdaNode.OutputFormat.CJS,
        mainFields: ["module", "main"],
        externalModules: [
          "@aws-sdk/client-dynamodb",
          "@aws-sdk/lib-dynamodb",
        ],
        sourceMap: true,
      },
      depsLockFilePath: path.join(__dirname, "../../../pnpm-lock.yaml"),
    });

    this.function = fn;

    // Grant DynamoDB write access to delivery tables
    props.deliveryArticlesTable.grantWriteData(fn);
    props.deliveryBlogsTable.grantReadWriteData(fn);
    props.deliveryUpdatesTable.grantWriteData(fn);

    // EventBridge rule: capture all domain events from the API
    new events.Rule(this, "DomainEventsRule", {
      eventBus: props.eventBus,
      ruleName: `bbtg-news-${props.environment}-domain-events`,
      description: "Routes all domain events to the consumer Lambda",
      eventPattern: {
        source: ["bbtg-news.api"],
        detailType: ["ArticlePublished", "UpdatePosted", "BlogClosed"],
      },
      targets: [new targets.LambdaFunction(fn)],
    });
  }
}
