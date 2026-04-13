import { describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { DataStack } from "../lib/stacks/data-stack";

function createTestDataStack(): Template {
  const app = new cdk.App();

  // DataStack needs a VPC from NetworkStack — use a minimal one for testing
  const vpcStack = new cdk.Stack(app, "VpcStack", {
    env: { account: "123456789012", region: "eu-west-1" },
  });
  const vpc = new ec2.Vpc(vpcStack, "Vpc", { maxAzs: 2 });

  const stack = new DataStack(app, "TestDataStack", {
    env: { account: "123456789012", region: "eu-west-1" },
    environment: "test",
    vpc,
  });

  return Template.fromStack(stack);
}

describe("DataStack", () => {
  it("creates seven DynamoDB tables (3 editorial + 4 delivery)", () => {
    const template = createTestDataStack();
    template.resourceCountIs("AWS::DynamoDB::Table", 7);
  });

  it("editorial-articles table has correct key schema", () => {
    const template = createTestDataStack();
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "test-editorial-articles",
      KeySchema: [{ AttributeName: "articleId", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  it("delivery-articles table has correct key schema", () => {
    const template = createTestDataStack();
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "test-delivery-articles",
      KeySchema: [{ AttributeName: "articleId", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  it("editorial-blogs table has correct key schema", () => {
    const template = createTestDataStack();
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "test-editorial-blogs",
      KeySchema: [{ AttributeName: "blogId", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  it("delivery-updates table has a GSI for blogId-postedAt", () => {
    const template = createTestDataStack();
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "test-delivery-updates",
      KeySchema: [{ AttributeName: "updateId", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [
        {
          IndexName: "blogId-postedAt-index",
          KeySchema: [
            { AttributeName: "blogId", KeyType: "HASH" },
            { AttributeName: "postedAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    });
  });

  it("creates a Redis replication group", () => {
    const template = createTestDataStack();
    template.resourceCountIs("AWS::ElastiCache::ReplicationGroup", 1);
  });

  it("uses cache.t4g.micro in non-prod", () => {
    const template = createTestDataStack();
    template.hasResourceProperties("AWS::ElastiCache::ReplicationGroup", {
      CacheNodeType: "cache.t4g.micro",
      Engine: "redis",
      EngineVersion: "7.1",
    });
  });

  it("sets RemovalPolicy to DESTROY in non-prod", () => {
    const template = createTestDataStack();
    // DynamoDB tables with RemovalPolicy.DESTROY have DeletionPolicy: Delete
    template.hasResource("AWS::DynamoDB::Table", {
      DeletionPolicy: "Delete",
    });
  });
});
