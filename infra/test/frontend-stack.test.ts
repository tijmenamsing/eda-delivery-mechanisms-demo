import { describe, it, expect } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { FrontendStack } from "../lib/stacks/frontend-stack";

function createTestFrontendStack(): Template {
  const app = new cdk.App();

  const stack = new FrontendStack(app, "TestFrontendStack", {
    env: { account: "123456789012", region: "eu-west-1" },
    environment: "test",
    apiGatewayUrl: "https://abc123.execute-api.eu-west-1.amazonaws.com",
    albDnsName: "my-alb-1234567890.eu-west-1.elb.amazonaws.com",
  });

  return Template.fromStack(stack);
}

describe("FrontendStack", () => {
  it("creates an S3 bucket", () => {
    const template = createTestFrontendStack();
    template.resourceCountIs("AWS::S3::Bucket", 1);
  });

  it("S3 bucket blocks public access", () => {
    const template = createTestFrontendStack();
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it("creates a CloudFront distribution", () => {
    const template = createTestFrontendStack();
    template.resourceCountIs("AWS::CloudFront::Distribution", 1);
  });

  it("CloudFront has a default root object", () => {
    const template = createTestFrontendStack();
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        DefaultRootObject: "index.html",
      },
    });
  });

  it("CloudFront has error responses for SPA fallback", () => {
    const template = createTestFrontendStack();
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        CustomErrorResponses: [
          {
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: "/index.html",
          },
          {
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: "/index.html",
          },
        ],
      },
    });
  });
});
