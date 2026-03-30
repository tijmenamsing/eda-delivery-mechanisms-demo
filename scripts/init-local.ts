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

const articlesTable = process.env["ARTICLES_TABLE"] ?? "dev-articles";
const blogsTable = process.env["BLOGS_TABLE"] ?? "dev-blogs";
const updatesTable = process.env["UPDATES_TABLE"] ?? "dev-updates";

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

  await createTable(
    articlesTable,
    [{ AttributeName: "articleId", KeyType: "HASH" }],
    [{ AttributeName: "articleId", AttributeType: "S" }],
  );

  await createTable(
    blogsTable,
    [{ AttributeName: "blogId", KeyType: "HASH" }],
    [{ AttributeName: "blogId", AttributeType: "S" }],
  );

  await createTable(
    updatesTable,
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

  const chatMessagesTable =
    process.env["CHAT_MESSAGES_TABLE"] ?? "dev-chat-messages";

  await createTable(
    chatMessagesTable,
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
