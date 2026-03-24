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
  readonly articlesTable: dynamodb.ITable;
  readonly blogsTable: dynamodb.ITable;
  readonly updatesTable: dynamodb.ITable;
  readonly eventBus: events.IEventBus;
  readonly environment: string;
  readonly redisUrl: string;
}

/**
 * Lambda function that hosts the Express CRUD API via `serverless-http`.
 * API Gateway HTTP API routes (articles, blogs, updates) all land here.
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
      memorySize: 512,
      timeout: cdk.Duration.seconds(29),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [sg],
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
      },
      bundling: {
        // esbuild converts ESM source to CJS for the Lambda runtime
        format: lambdaNode.OutputFormat.CJS,
        mainFields: ["module", "main"],
        // AWS SDK v3 is available in the Lambda runtime — no need to bundle it
        externalModules: [
          "@aws-sdk/client-dynamodb",
          "@aws-sdk/client-eventbridge",
          "@aws-sdk/lib-dynamodb",
        ],
        sourceMap: true,
      },
      depsLockFilePath: path.join(__dirname, "../../../pnpm-lock.yaml"),
    });

    // Grant DynamoDB access
    props.articlesTable.grantReadWriteData(fn);
    props.blogsTable.grantReadWriteData(fn);
    props.updatesTable.grantReadWriteData(fn);

    // Grant EventBridge put events
    props.eventBus.grantPutEventsTo(fn);

    this.function = fn;
  }
}
