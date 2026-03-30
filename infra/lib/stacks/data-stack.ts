import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import type { Construct } from "constructs";

export interface DataStackProps extends cdk.StackProps {
  readonly environment: string;
  readonly vpc: ec2.IVpc;
}

export class DataStack extends cdk.Stack {
  public readonly articlesTable: dynamodb.ITable;
  public readonly blogsTable: dynamodb.ITable;
  public readonly updatesTable: dynamodb.ITable;
  public readonly chatMessagesTable: dynamodb.ITable;
  public readonly redisCluster: elasticache.CfnReplicationGroup;
  public readonly redisSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const removalPolicy =
      props.environment === "prod"
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY;

    // ------------------------------------------------------------------ //
    // DynamoDB Tables
    // ------------------------------------------------------------------ //

    this.articlesTable = new dynamodb.Table(this, "ArticlesTable", {
      tableName: `${props.environment}-articles`,
      partitionKey: {
        name: "articleId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: props.environment === "prod",
      },
    });

    this.blogsTable = new dynamodb.Table(this, "BlogsTable", {
      tableName: `${props.environment}-blogs`,
      partitionKey: {
        name: "blogId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: props.environment === "prod",
      },
    });

    const updatesTable = new dynamodb.Table(this, "UpdatesTable", {
      tableName: `${props.environment}-updates`,
      partitionKey: {
        name: "updateId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: props.environment === "prod",
      },
    });

    // GSI for querying updates by blogId sorted by postedAt
    updatesTable.addGlobalSecondaryIndex({
      indexName: "blogId-postedAt-index",
      partitionKey: {
        name: "blogId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "postedAt",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.updatesTable = updatesTable;

    // ------------------------------------------------------------------ //
    // Chat Messages Table
    // ------------------------------------------------------------------ //

    const chatMessagesTable = new dynamodb.Table(this, "ChatMessagesTable", {
      tableName: `${props.environment}-chat-messages`,
      partitionKey: {
        name: "messageId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      timeToLiveAttribute: "ttl",
    });

    chatMessagesTable.addGlobalSecondaryIndex({
      indexName: "blogId-postedAt-index",
      partitionKey: {
        name: "blogId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "postedAt",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.chatMessagesTable = chatMessagesTable;

    // ------------------------------------------------------------------ //
    // ElastiCache Redis (L1 — no stable L2 construct available)
    // ------------------------------------------------------------------ //

    this.redisSecurityGroup = new ec2.SecurityGroup(this, "RedisSg", {
      vpc: props.vpc,
      description: "Security group for ElastiCache Redis",
      allowAllOutbound: false,
    });

    const subnetGroup = new elasticache.CfnSubnetGroup(
      this,
      "RedisSubnetGroup",
      {
        description: "Private subnets for ElastiCache Redis",
        subnetIds: props.vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }).subnetIds,
        cacheSubnetGroupName: `${props.environment}-bbtg-redis-subnets`,
      },
    );

    this.redisCluster = new elasticache.CfnReplicationGroup(
      this,
      "RedisCluster",
      {
        replicationGroupDescription: `BBTG Nieuws Redis (${props.environment})`,
        engine: "redis",
        engineVersion: "7.1",
        cacheNodeType:
          props.environment === "prod"
            ? "cache.r7g.large"
            : "cache.t4g.micro",
        numCacheClusters: props.environment === "prod" ? 2 : 1,
        automaticFailoverEnabled: props.environment === "prod",
        multiAzEnabled: props.environment === "prod",
        cacheSubnetGroupName: subnetGroup.cacheSubnetGroupName,
        securityGroupIds: [this.redisSecurityGroup.securityGroupId],
        atRestEncryptionEnabled: true,
        // TLS disabled for simplicity in this demo — ioredis default connects
        // without TLS. Enable in production and use rediss:// URL prefix.
        transitEncryptionEnabled: false,
      },
    );

    // Ensure the subnet group exists before the cluster tries to reference it.
    this.redisCluster.addDependency(subnetGroup);

    // Allow any resource in the VPC to connect to Redis on port 6379.
    // This covers ECS tasks, Lambda functions, and any future services that
    // need pub/sub access. Keeping the rule here (next to the SG definition)
    // avoids cross-stack security group references which cause CDK cycles.
    this.redisSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(6379),
      "Allow VPC traffic to access Redis",
    );

    // ------------------------------------------------------------------ //
    // Outputs
    // ------------------------------------------------------------------ //

    new cdk.CfnOutput(this, "RedisEndpoint", {
      value: this.redisCluster.attrPrimaryEndPointAddress,
      exportName: `${props.environment}-redis-endpoint`,
    });

    new cdk.CfnOutput(this, "RedisPort", {
      value: this.redisCluster.attrPrimaryEndPointPort,
      exportName: `${props.environment}-redis-port`,
    });
  }
}
