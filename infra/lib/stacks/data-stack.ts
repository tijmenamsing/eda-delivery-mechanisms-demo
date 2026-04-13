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
  // Editorial context tables (source of truth for authored content)
  public readonly editorialArticlesTable: dynamodb.ITable;
  public readonly editorialBlogsTable: dynamodb.ITable;
  public readonly editorialUpdatesTable: dynamodb.ITable;

  // Delivery context tables (materialized read models)
  public readonly deliveryArticlesTable: dynamodb.ITable;
  public readonly deliveryBlogsTable: dynamodb.ITable;
  public readonly deliveryUpdatesTable: dynamodb.ITable;
  public readonly deliveryChatMessagesTable: dynamodb.ITable;

  public readonly redisCluster: elasticache.CfnReplicationGroup;
  public readonly redisSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const removalPolicy =
      props.environment === "prod"
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY;

    // ------------------------------------------------------------------ //
    // Editorial Context Tables
    // ------------------------------------------------------------------ //

    this.editorialArticlesTable = new dynamodb.Table(this, "EditorialArticlesTable", {
      tableName: `${props.environment}-editorial-articles`,
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

    this.editorialBlogsTable = new dynamodb.Table(this, "EditorialBlogsTable", {
      tableName: `${props.environment}-editorial-blogs`,
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

    const editorialUpdatesTable = new dynamodb.Table(this, "EditorialUpdatesTable", {
      tableName: `${props.environment}-editorial-updates`,
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

    this.editorialUpdatesTable = editorialUpdatesTable;

    // ------------------------------------------------------------------ //
    // Delivery Context Tables
    // ------------------------------------------------------------------ //

    this.deliveryArticlesTable = new dynamodb.Table(this, "DeliveryArticlesTable", {
      tableName: `${props.environment}-delivery-articles`,
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

    this.deliveryBlogsTable = new dynamodb.Table(this, "DeliveryBlogsTable", {
      tableName: `${props.environment}-delivery-blogs`,
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

    const deliveryUpdatesTable = new dynamodb.Table(this, "DeliveryUpdatesTable", {
      tableName: `${props.environment}-delivery-updates`,
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
    deliveryUpdatesTable.addGlobalSecondaryIndex({
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

    this.deliveryUpdatesTable = deliveryUpdatesTable;

    // ------------------------------------------------------------------ //
    // Chat Messages Table (delivery context only — user-generated content)
    // ------------------------------------------------------------------ //

    const deliveryChatMessagesTable = new dynamodb.Table(this, "DeliveryChatMessagesTable", {
      tableName: `${props.environment}-delivery-chat-messages`,
      partitionKey: {
        name: "messageId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      timeToLiveAttribute: "ttl",
    });

    deliveryChatMessagesTable.addGlobalSecondaryIndex({
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

    this.deliveryChatMessagesTable = deliveryChatMessagesTable;

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
        transitEncryptionEnabled: false,
      },
    );

    this.redisCluster.addDependency(subnetGroup);

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
