import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import type { Construct } from "constructs";

export interface AuthoringFunctionProps {
  readonly vpc: ec2.IVpc;
  readonly editorialArticlesTable: dynamodb.ITable;
  readonly editorialBlogsTable: dynamodb.ITable;
  readonly editorialUpdatesTable: dynamodb.ITable;
  readonly deliveryArticlesTable: dynamodb.ITable;
  readonly deliveryBlogsTable: dynamodb.ITable;
  readonly deliveryUpdatesTable: dynamodb.ITable;
  readonly deliveryChatMessagesTable: dynamodb.ITable;
  readonly eventBus: events.IEventBus;
  readonly environment: string;
  readonly redisUrl: string;
}

/**
 * Lambda function that hosts the Express CRUD API via `serverless-http`.
 * API Gateway HTTP API routes (articles, blogs, updates) all land here.
 * Needs access to both editorial (write) and delivery (read) tables.
 */
export class AuthoringFunction extends cdk.Resource {
  public readonly function: lambda.IFunction;
  public readonly securityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: AuthoringFunctionProps) {
    super(scope, id);

    const sg = new ec2.SecurityGroup(this, "Sg", {
      vpc: props.vpc,
      description: "Security group for authoring Lambda",
      allowAllOutbound: true,
    });
    this.securityGroup = sg;

    const fn = new lambdaNode.NodejsFunction(this, "Handler", {
      entry: path.join(__dirname, "../../../apps/api/src/lambda.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(29),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [sg],
      environment: {
        NODE_ENV: "production",
        PORT: "3001",
        REDIS_URL: props.redisUrl,
        EDITORIAL_ARTICLES_TABLE: props.editorialArticlesTable.tableName,
        EDITORIAL_BLOGS_TABLE: props.editorialBlogsTable.tableName,
        EDITORIAL_UPDATES_TABLE: props.editorialUpdatesTable.tableName,
        DELIVERY_ARTICLES_TABLE: props.deliveryArticlesTable.tableName,
        DELIVERY_BLOGS_TABLE: props.deliveryBlogsTable.tableName,
        DELIVERY_UPDATES_TABLE: props.deliveryUpdatesTable.tableName,
        DELIVERY_CHAT_MESSAGES_TABLE: props.deliveryChatMessagesTable.tableName,
        EVENT_PUBLISHER: "eventbridge",
        EVENTBRIDGE_BUS_NAME: props.eventBus.eventBusName,
        ALLOWED_ORIGIN: "*",
      },
      bundling: {
        format: lambdaNode.OutputFormat.CJS,
        mainFields: ["module", "main"],
        externalModules: [
          "@aws-sdk/client-dynamodb",
          "@aws-sdk/client-eventbridge",
          "@aws-sdk/lib-dynamodb",
        ],
        sourceMap: true,
      },
      depsLockFilePath: path.join(__dirname, "../../../pnpm-lock.yaml"),
    });

    // Grant editorial tables read/write (authoring writes)
    props.editorialArticlesTable.grantReadWriteData(fn);
    props.editorialBlogsTable.grantReadWriteData(fn);
    props.editorialUpdatesTable.grantReadWriteData(fn);

    // Grant delivery tables read access (GET endpoints serve from delivery)
    props.deliveryArticlesTable.grantReadData(fn);
    props.deliveryBlogsTable.grantReadData(fn);
    props.deliveryUpdatesTable.grantReadData(fn);
    props.deliveryChatMessagesTable.grantReadData(fn);

    // Grant EventBridge put events
    props.eventBus.grantPutEventsTo(fn);

    this.function = fn;
  }
}
