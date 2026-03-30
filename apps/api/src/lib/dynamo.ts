import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { env } from "./env.js";

// Only inject explicit credentials for LocalStack (local dev).
// On Lambda/ECS the SDK credential chain reads AWS_ACCESS_KEY_ID +
// AWS_SECRET_ACCESS_KEY + AWS_SESSION_TOKEN from the runtime environment,
// which includes the required session token for assumed roles.
const clientConfig: DynamoDBClientConfig = {
  region: env.AWS_REGION,
  ...(env.DYNAMODB_ENDPOINT
    ? {
        endpoint: env.DYNAMODB_ENDPOINT,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID ?? "test",
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? "test",
        },
      }
    : {}),
};

const dynamoClient = new DynamoDBClient(clientConfig);
export const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export async function putItem<T extends Record<string, unknown>>(
  tableName: string,
  item: T,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
    }),
  );
}

export async function getItem<T>(
  tableName: string,
  key: Record<string, string>,
): Promise<T | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: key,
    }),
  );
  return (result.Item as T | undefined) ?? null;
}

export async function queryItems<T>(
  tableName: string,
  keyCondition: string,
  values: Record<string, unknown>,
  indexName?: string,
): Promise<T[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: values,
      ...(indexName ? { IndexName: indexName } : {}),
    }),
  );
  return (result.Items as T[] | undefined) ?? [];
}

export async function scanItems<T>(tableName: string): Promise<T[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: tableName,
    }),
  );
  return (result.Items as T[] | undefined) ?? [];
}
