import {
  DynamoDBClient,
  CreateTableCommand,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";

const endpoint = process.env["DYNAMODB_ENDPOINT"] ?? "http://localhost:4566";
const region = process.env["AWS_REGION"] ?? "eu-west-1";

const client = new DynamoDBClient({
  region,
  endpoint,
  credentials: {
    accessKeyId: process.env["AWS_ACCESS_KEY_ID"] ?? "test",
    secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] ?? "test",
  },
});

// Editorial context tables
const editorialArticlesTable = process.env["EDITORIAL_ARTICLES_TABLE"] ?? "dev-editorial-articles";
const editorialBlogsTable = process.env["EDITORIAL_BLOGS_TABLE"] ?? "dev-editorial-blogs";
const editorialUpdatesTable = process.env["EDITORIAL_UPDATES_TABLE"] ?? "dev-editorial-updates";

// Delivery context tables
const deliveryArticlesTable = process.env["DELIVERY_ARTICLES_TABLE"] ?? "dev-delivery-articles";
const deliveryBlogsTable = process.env["DELIVERY_BLOGS_TABLE"] ?? "dev-delivery-blogs";
const deliveryUpdatesTable = process.env["DELIVERY_UPDATES_TABLE"] ?? "dev-delivery-updates";
const deliveryChatMessagesTable = process.env["DELIVERY_CHAT_MESSAGES_TABLE"] ?? "dev-delivery-chat-messages";

async function tableExists(tableName: string): Promise<boolean> {
  const result = await client.send(new ListTablesCommand({}));
  return result.TableNames?.includes(tableName) ?? false;
}

async function createTable(
  tableName: string,
  keySchema: { AttributeName: string; KeyType: "HASH" | "RANGE" }[],
  attributeDefinitions: { AttributeName: string; AttributeType: "S" | "N" }[],
  globalSecondaryIndexes?: {
    IndexName: string;
    KeySchema: { AttributeName: string; KeyType: "HASH" | "RANGE" }[];
    Projection: { ProjectionType: "ALL" | "KEYS_ONLY" | "INCLUDE" };
  }[],
): Promise<void> {
  if (await tableExists(tableName)) {
    console.log(`  ⏭  Table ${tableName} already exists, skipping`);
    return;
  }

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: keySchema,
      AttributeDefinitions: attributeDefinitions,
      BillingMode: "PAY_PER_REQUEST",
      ...(globalSecondaryIndexes
        ? {
            GlobalSecondaryIndexes: globalSecondaryIndexes.map((gsi) => ({
              ...gsi,
              ProvisionedThroughput: undefined,
            })),
          }
        : {}),
    }),
  );
  console.log(`  ✅ Created table ${tableName}`);
}

async function main(): Promise<void> {
  console.log(`\n🗄  Initializing DynamoDB tables at ${endpoint}\n`);

  // Editorial context (source of truth for authored content)
  console.log("  📝 Editorial context tables:");
  await createTable(
    editorialArticlesTable,
    [{ AttributeName: "articleId", KeyType: "HASH" }],
    [{ AttributeName: "articleId", AttributeType: "S" }],
  );

  await createTable(
    editorialBlogsTable,
    [{ AttributeName: "blogId", KeyType: "HASH" }],
    [{ AttributeName: "blogId", AttributeType: "S" }],
  );

  await createTable(
    editorialUpdatesTable,
    [{ AttributeName: "updateId", KeyType: "HASH" }],
    [{ AttributeName: "updateId", AttributeType: "S" }],
  );

  // Delivery context (materialized read models)
  console.log("\n  📤 Delivery context tables:");
  await createTable(
    deliveryArticlesTable,
    [{ AttributeName: "articleId", KeyType: "HASH" }],
    [{ AttributeName: "articleId", AttributeType: "S" }],
  );

  await createTable(
    deliveryBlogsTable,
    [{ AttributeName: "blogId", KeyType: "HASH" }],
    [{ AttributeName: "blogId", AttributeType: "S" }],
  );

  await createTable(
    deliveryUpdatesTable,
    [
      { AttributeName: "updateId", KeyType: "HASH" },
    ],
    [
      { AttributeName: "updateId", AttributeType: "S" },
      { AttributeName: "blogId", AttributeType: "S" },
      { AttributeName: "postedAt", AttributeType: "S" },
    ],
    [
      {
        IndexName: "blogId-postedAt-index",
        KeySchema: [
          { AttributeName: "blogId", KeyType: "HASH" },
          { AttributeName: "postedAt", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  );

  await createTable(
    deliveryChatMessagesTable,
    [{ AttributeName: "messageId", KeyType: "HASH" }],
    [
      { AttributeName: "messageId", AttributeType: "S" },
      { AttributeName: "blogId", AttributeType: "S" },
      { AttributeName: "postedAt", AttributeType: "S" },
    ],
    [
      {
        IndexName: "blogId-postedAt-index",
        KeySchema: [
          { AttributeName: "blogId", KeyType: "HASH" },
          { AttributeName: "postedAt", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
  );

  console.log("\n✅ All tables initialized\n");
}

main().catch((err) => {
  console.error("❌ Failed to initialize tables:", err);
  process.exit(1);
});
