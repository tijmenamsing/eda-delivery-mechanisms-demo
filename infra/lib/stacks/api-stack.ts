import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as events from "aws-cdk-lib/aws-events";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { SseService } from "../constructs/sse-service";
import { AuthoringFunction } from "../constructs/authoring-function";
import { EventConsumerFunction } from "../constructs/event-consumer-function";

export interface ApiStackProps extends cdk.StackProps {
  readonly environment: string;
  readonly vpc: ec2.IVpc;
  // Editorial context tables
  readonly editorialArticlesTable: dynamodb.ITable;
  readonly editorialBlogsTable: dynamodb.ITable;
  readonly editorialUpdatesTable: dynamodb.ITable;
  // Delivery context tables
  readonly deliveryArticlesTable: dynamodb.ITable;
  readonly deliveryBlogsTable: dynamodb.ITable;
  readonly deliveryUpdatesTable: dynamodb.ITable;
  readonly deliveryChatMessagesTable: dynamodb.ITable;
  readonly redisCluster: elasticache.CfnReplicationGroup;
}

export class ApiStack extends cdk.Stack {
  public readonly apiGatewayUrl: string;
  public readonly albDnsName: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const redisUrl = cdk.Fn.join("", [
      "redis://",
      props.redisCluster.attrPrimaryEndPointAddress,
      ":",
      props.redisCluster.attrPrimaryEndPointPort,
    ]);

    // ------------------------------------------------------------------ //
    // EventBridge — custom bus for domain events
    // ------------------------------------------------------------------ //

    const eventBus = new events.EventBus(this, "EventBus", {
      eventBusName: `bbtg-news-${props.environment}`,
    });

    // ------------------------------------------------------------------ //
    // Authoring Lambda — serves CRUD API via API Gateway HTTP API
    // ------------------------------------------------------------------ //

    const authoringFn = new AuthoringFunction(this, "AuthoringFn", {
      vpc: props.vpc,
      editorialArticlesTable: props.editorialArticlesTable,
      editorialBlogsTable: props.editorialBlogsTable,
      editorialUpdatesTable: props.editorialUpdatesTable,
      deliveryArticlesTable: props.deliveryArticlesTable,
      deliveryBlogsTable: props.deliveryBlogsTable,
      deliveryUpdatesTable: props.deliveryUpdatesTable,
      deliveryChatMessagesTable: props.deliveryChatMessagesTable,
      eventBus,
      environment: props.environment,
      redisUrl,
    });

    // ------------------------------------------------------------------ //
    // API Gateway HTTP API (v2) — L1 constructs (stable, no alpha dep)
    // ------------------------------------------------------------------ //

    const httpApi = new apigatewayv2.CfnApi(this, "HttpApi", {
      name: `bbtg-news-${props.environment}-api`,
      protocolType: "HTTP",
      corsConfiguration: {
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "X-Request-Id"],
        allowOrigins: ["*"],
      },
    });

    new apigatewayv2.CfnStage(this, "HttpApiDefaultStage", {
      apiId: httpApi.ref,
      stageName: "$default",
      autoDeploy: true,
    });

    const lambdaIntegration = new apigatewayv2.CfnIntegration(
      this,
      "LambdaIntegration",
      {
        apiId: httpApi.ref,
        integrationType: "AWS_PROXY",
        integrationUri: authoringFn.function.functionArn,
        payloadFormatVersion: "2.0",
      },
    );

    // Grant API Gateway permission to invoke the Lambda
    authoringFn.function.addPermission("ApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${httpApi.ref}/*`,
    });

    // Route definitions — all funnel to the same Express Lambda
    const routes: Array<{ method: string; path: string }> = [
      { method: "GET", path: "/articles" },
      { method: "POST", path: "/articles" },
      { method: "GET", path: "/blogs" },
      { method: "GET", path: "/blogs/{blogId}" },
      { method: "POST", path: "/blogs/{blogId}/close" },
      { method: "POST", path: "/updates" },
      { method: "GET", path: "/chat/{blogId}/messages" },
      { method: "GET", path: "/health" },
    ];

    for (const route of routes) {
      const routeId = `${route.method}${route.path.replace(/[^a-zA-Z0-9]/g, "")}`;
      new apigatewayv2.CfnRoute(this, `Route-${routeId}`, {
        apiId: httpApi.ref,
        routeKey: `${route.method} ${route.path}`,
        target: `integrations/${lambdaIntegration.ref}`,
      });
    }

    // ------------------------------------------------------------------ //
    // SSE Service — ECS Fargate + ALB for long-lived SSE connections
    // ------------------------------------------------------------------ //

    const sseService = new SseService(this, "SseService", {
      vpc: props.vpc,
      redisUrl,
      deliveryBlogsTable: props.deliveryBlogsTable,
      deliveryUpdatesTable: props.deliveryUpdatesTable,
      deliveryChatMessagesTable: props.deliveryChatMessagesTable,
      eventBus,
      environment: props.environment,
    });

    // ------------------------------------------------------------------ //
    // Event Consumer Lambda — bridges EventBridge → Delivery tables + Redis
    // ------------------------------------------------------------------ //

    const consumerFn = new EventConsumerFunction(this, "ConsumerFn", {
      vpc: props.vpc,
      eventBus,
      redisUrl,
      deliveryArticlesTable: props.deliveryArticlesTable,
      deliveryBlogsTable: props.deliveryBlogsTable,
      deliveryUpdatesTable: props.deliveryUpdatesTable,
      environment: props.environment,
    });

    // ------------------------------------------------------------------ //
    // Outputs
    // ------------------------------------------------------------------ //

    this.apiGatewayUrl = cdk.Fn.join("", [
      "https://",
      httpApi.ref,
      ".execute-api.",
      this.region,
      ".amazonaws.com",
    ]);

    this.albDnsName = sseService.loadBalancerDnsName;

    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: this.apiGatewayUrl,
      exportName: `${props.environment}-bbtg-api-gateway-url`,
    });
    new cdk.CfnOutput(this, "AlbDnsName", {
      value: this.albDnsName,
      exportName: `${props.environment}-bbtg-alb-dns-name`,
    });
    new cdk.CfnOutput(this, "EventBusName", { value: eventBus.eventBusName });
  }
}
