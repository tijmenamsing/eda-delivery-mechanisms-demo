import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import type { Construct } from "constructs";

export interface EventConsumerFunctionProps {
  readonly vpc: ec2.IVpc;
  readonly eventBus: events.IEventBus;
  readonly redisUrl: string;
  readonly environment: string;
}

/**
 * Lambda that bridges EventBridge → Redis pub/sub.
 * Listens for UpdatePosted events on the custom bus and publishes
 * the event payload to the Redis channel so ECS SSE nodes can fan it out.
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
      },
      bundling: {
        format: lambdaNode.OutputFormat.CJS,
        mainFields: ["module", "main"],
        sourceMap: true,
      },
      depsLockFilePath: path.join(__dirname, "../../../pnpm-lock.yaml"),
    });

    this.function = fn;

    // EventBridge rule: capture UpdatePosted events from the API
    new events.Rule(this, "UpdatePostedRule", {
      eventBus: props.eventBus,
      ruleName: `bbtg-news-${props.environment}-update-posted`,
      description: "Routes UpdatePosted events to the Redis consumer Lambda",
      eventPattern: {
        source: ["bbtg-news.api"],
        detailType: ["UpdatePosted"],
      },
      targets: [new targets.LambdaFunction(fn)],
    });
  }
}
