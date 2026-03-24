#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/stacks/network-stack";
import { DataStack } from "../lib/stacks/data-stack";
import { ApiStack } from "../lib/stacks/api-stack";
import { FrontendStack } from "../lib/stacks/frontend-stack";

const app = new cdk.App();

const environment = app.node.tryGetContext("environment") as string;
const awsAccountId = app.node.tryGetContext("awsAccountId") as string;
const awsRegion =
  (app.node.tryGetContext("awsRegion") as string | undefined) ?? "eu-west-1";

if (!environment || !awsAccountId) {
  throw new Error(
    "CDK context must include 'environment' and 'awsAccountId'. " +
      "Pass them with -c environment=dev -c awsAccountId=123456789012",
  );
}

const cdkEnv: cdk.Environment = { account: awsAccountId, region: awsRegion };
const prefix = `bbtg-news-${environment}`;

const tags: Record<string, string> = {
  Project: "bbtg-news",
  Environment: environment,
};

// ---------- Stacks ----------
// Order matters: each stack depends on resources from the previous one.

const networkStack = new NetworkStack(app, `${prefix}-network`, {
  env: cdkEnv,
  tags,
  environment,
});

const dataStack = new DataStack(app, `${prefix}-data`, {
  env: cdkEnv,
  tags,
  environment,
  vpc: networkStack.vpc,
});

const apiStack = new ApiStack(app, `${prefix}-api`, {
  env: cdkEnv,
  tags,
  environment,
  vpc: networkStack.vpc,
  articlesTable: dataStack.articlesTable,
  blogsTable: dataStack.blogsTable,
  updatesTable: dataStack.updatesTable,
  redisCluster: dataStack.redisCluster,
});

new FrontendStack(app, `${prefix}-frontend`, {
  env: cdkEnv,
  tags,
  environment,
  apiGatewayUrl: cdk.Fn.importValue(`${environment}-bbtg-api-gateway-url`),
  albDnsName: cdk.Fn.importValue(`${environment}-bbtg-alb-dns-name`),
});
