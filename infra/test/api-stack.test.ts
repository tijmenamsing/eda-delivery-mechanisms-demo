import { describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import { ApiStack } from "../lib/stacks/api-stack";

function createTestApiStack(): Template {
  const app = new cdk.App();
  const env = { account: "123456789012", region: "eu-west-1" };

  // Dependency stacks — minimal setup for the API stack
  const depStack = new cdk.Stack(app, "DepStack", { env });

  const vpc = new ec2.Vpc(depStack, "Vpc", { maxAzs: 2 });

  const articlesTable = new dynamodb.Table(depStack, "Articles", {
    partitionKey: { name: "articleId", type: dynamodb.AttributeType.STRING },
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  const blogsTable = new dynamodb.Table(depStack, "Blogs", {
    partitionKey: { name: "blogId", type: dynamodb.AttributeType.STRING },
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  const updatesTable = new dynamodb.Table(depStack, "Updates", {
    partitionKey: { name: "updateId", type: dynamodb.AttributeType.STRING },
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  const redisSg = new ec2.SecurityGroup(depStack, "RedisSg", { vpc });

  const subnetGroup = new elasticache.CfnSubnetGroup(
    depStack,
    "RedisSubnets",
    {
      description: "test",
      subnetIds: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      }).subnetIds,
    },
  );

  const redisCluster = new elasticache.CfnReplicationGroup(
    depStack,
    "Redis",
    {
      replicationGroupDescription: "test",
      engine: "redis",
      cacheNodeType: "cache.t4g.micro",
      numCacheClusters: 1,
      cacheSubnetGroupName: subnetGroup.ref,
      securityGroupIds: [redisSg.securityGroupId],
    },
  );

  const stack = new ApiStack(app, "TestApiStack", {
    env,
    environment: "test",
    vpc,
    articlesTable,
    blogsTable,
    updatesTable,
    redisCluster,
  });

  return Template.fromStack(stack);
}

describe("ApiStack", () => {
  it("creates an API Gateway HTTP API", () => {
    const template = createTestApiStack();
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      ProtocolType: "HTTP",
    });
  });

  it("creates API Gateway routes for all CRUD endpoints", () => {
    const template = createTestApiStack();

    const expectedRoutes = [
      "GET /articles",
      "POST /articles",
      "GET /blogs",
      "GET /blogs/{blogId}",
      "POST /updates",
      "GET /health",
    ];

    for (const routeKey of expectedRoutes) {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
        RouteKey: routeKey,
      });
    }
  });

  it("creates an EventBridge custom bus", () => {
    const template = createTestApiStack();
    template.hasResourceProperties("AWS::Events::EventBus", {
      Name: "bbtg-news-test",
    });
  });

  it("creates an EventBridge rule for UpdatePosted events", () => {
    const template = createTestApiStack();
    template.hasResourceProperties("AWS::Events::Rule", {
      EventPattern: {
        source: ["bbtg-news.api"],
        "detail-type": ["UpdatePosted"],
      },
    });
  });

  it("creates an ECS cluster", () => {
    const template = createTestApiStack();
    template.resourceCountIs("AWS::ECS::Cluster", 1);
  });

  it("creates a Fargate service", () => {
    const template = createTestApiStack();
    template.hasResourceProperties("AWS::ECS::Service", {
      LaunchType: "FARGATE",
    });
  });

  it("creates an ALB", () => {
    const template = createTestApiStack();
    template.resourceCountIs(
      "AWS::ElasticLoadBalancingV2::LoadBalancer",
      1,
    );
  });

  it("ALB listener on port 80", () => {
    const template = createTestApiStack();
    template.hasResourceProperties(
      "AWS::ElasticLoadBalancingV2::Listener",
      {
        Port: 80,
        Protocol: "HTTP",
      },
    );
  });

  it("creates at least two Lambda functions (authoring + consumer)", () => {
    const template = createTestApiStack();

    // Count all Lambda functions — there should be at least two:
    // 1) Authoring Lambda  2) Event consumer Lambda
    // CDK may also create a custom resource Lambda (e.g. for log retention).
    const lambdas = template.findResources("AWS::Lambda::Function");
    expect(Object.keys(lambdas).length).toBeGreaterThanOrEqual(2);
  });
});
