import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import type { Construct } from "constructs";

export interface FrontendStackProps extends cdk.StackProps {
  readonly environment: string;
  readonly apiGatewayUrl: string;
  readonly albDnsName: string;
}

export class FrontendStack extends cdk.Stack {
  public readonly distributionDomainName: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // ------------------------------------------------------------------ //
    // S3 bucket for the Next.js static export
    // ------------------------------------------------------------------ //

    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      bucketName: `bbtg-news-${props.environment}-frontend-${this.account}`,
      removalPolicy:
        props.environment === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.environment !== "prod",
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // ------------------------------------------------------------------ //
    // API Gateway origin — extract hostname from the full URL token
    // ------------------------------------------------------------------ //

    // apiGatewayUrl is "https://<id>.execute-api.<region>.amazonaws.com"
    // Split by "/" → ["https:", "", "<hostname>"] → pick index 2
    const apiHostname = cdk.Fn.select(
      2,
      cdk.Fn.split("/", props.apiGatewayUrl),
    );

    const apiOrigin = new origins.HttpOrigin(apiHostname);

    // ------------------------------------------------------------------ //
    // CloudFront distribution
    // SSE (/stream/*) is NOT routed through CloudFront — it goes direct
    // to the ALB. CloudFront buffers responses which breaks SSE.
    // ------------------------------------------------------------------ //

    // CloudFront Function: rewrite clean URLs to index.html.
    // S3 (via OAC) serves objects by exact key — it does NOT resolve directory
    // index files like S3 website hosting does. So /journalist → 403 because
    // there is no object at that key. We rewrite:
    //   /journalist        → /journalist/index.html
    //   /journalist/       → /journalist/index.html
    //   /blog/abc          → /blog/abc/index.html
    // Requests that already have a file extension are left untouched.
    const rewriteFn = new cloudfront.Function(this, "RewriteFn", {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var uri = event.request.uri;
  if (uri.endsWith('/')) {
    event.request.uri = uri + 'index.html';
  } else if (!uri.split('/').pop().includes('.')) {
    event.request.uri = uri + '/index.html';
  }
  return event.request;
}
      `.trim()),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: "Rewrite clean URLs to /index.html for S3 static export",
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `BBTG Nieuws (${props.environment})`,
      defaultRootObject: "index.html",
      // PriceClass_100 covers North America + Europe — sufficient for this demo
      // and significantly cheaper than the default (all edge locations worldwide).
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,

      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            function: rewriteFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },

      additionalBehaviors: {
        // CRUD API — disable caching so POST/GET always hit the origin.
        // A smarter setup would use a custom cache policy (cache GET, bypass
        // POST) but for the demo this keeps things simple.
        "/articles*": {
          origin: apiOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        "/blogs*": {
          origin: apiOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        "/updates*": {
          origin: apiOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        "/health*": {
          origin: apiOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },

      // SPA fallback — return index.html for 403/404 from S3
      errorResponses: [
        {
          httpStatus: 403,
          responsePagePath: "/index.html",
          responseHttpStatus: 200,
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responsePagePath: "/index.html",
          responseHttpStatus: 200,
          ttl: cdk.Duration.seconds(0),
        },
      ],

      // WAF is intentionally omitted. A CloudFront WAF WebACL must live in
      // us-east-1 which would require a cross-region stack. Out of scope for
      // the demo — add via a separate us-east-1 stack in production.
    });

    this.distributionDomainName = distribution.distributionDomainName;

    // ------------------------------------------------------------------ //
    // Outputs
    // ------------------------------------------------------------------ //

    new cdk.CfnOutput(this, "DistributionDomainName", {
      value: distribution.distributionDomainName,
    });

    new cdk.CfnOutput(this, "WebsiteBucketName", {
      value: websiteBucket.bucketName,
    });

    new cdk.CfnOutput(this, "AlbDnsNameDirect", {
      value: props.albDnsName,
      description:
        "Connect to this hostname directly for SSE (not via CloudFront)",
    });
  }
}
