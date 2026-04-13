// Event consumer Lambda handler — bridges EventBridge → Delivery context.
//
// Handles all three domain event types:
// - ArticlePublished → write to delivery-articles DynamoDB
// - UpdatePosted → write to delivery-updates DynamoDB + XADD to Redis Stream
// - BlogClosed → update delivery-blogs DynamoDB + Redis pub/sub for WS teardown

import Redis from "ioredis";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DomainEventSchema } from "@bbtg-news/types/events";
import { REDIS_CHANNELS, REDIS_STREAMS } from "@bbtg-news/types/constants";

// Reuse connections across Lambda invocations (warm start optimisation).
let redis: Redis | null = null;
let docClient: DynamoDBDocumentClient | null = null;

function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env["REDIS_URL"];
    if (!redisUrl) {
      throw new Error("REDIS_URL environment variable is required");
    }
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  }
  return redis;
}

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

interface EventBridgeEvent {
  readonly source: string;
  readonly "detail-type": string;
  readonly detail: unknown;
}

export async function handler(event: EventBridgeEvent): Promise<void> {
  const parsed = DomainEventSchema.parse(event.detail);
  const client = getDocClient();
  const r = getRedis();

  switch (parsed.type) {
    case "ArticlePublished": {
      const tableName = requireEnv("DELIVERY_ARTICLES_TABLE");
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            articleId: parsed.articleId,
            title: parsed.title,
            content: parsed.content,
            slug: parsed.slug,
            author: parsed.author,
            publishedAt: parsed.publishedAt,
          },
        }),
      );
      console.log(JSON.stringify({
        level: "info",
        msg: "Materialized article into delivery table",
        articleId: parsed.articleId,
      }));
      break;
    }

    case "UpdatePosted": {
      const tableName = requireEnv("DELIVERY_UPDATES_TABLE");

      // Write to delivery DynamoDB
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            updateId: parsed.updateId,
            blogId: parsed.blogId,
            content: parsed.content,
            author: parsed.author,
            minute: parsed.minute,
            type: parsed.updateType,
            postedAt: parsed.postedAt,
          },
        }),
      );

      // XADD to Redis Stream for SSE delivery
      const streamKey = REDIS_STREAMS.blogUpdates(parsed.blogId);
      const payload = JSON.stringify({
        updateId: parsed.updateId,
        blogId: parsed.blogId,
        content: parsed.content,
        author: parsed.author,
        minute: parsed.minute,
        type: parsed.updateType,
        postedAt: parsed.postedAt,
      });
      await r.xadd(streamKey, "*", "payload", payload);

      console.log(JSON.stringify({
        level: "info",
        msg: "Materialized update + added to Redis Stream",
        updateId: parsed.updateId,
        blogId: parsed.blogId,
        streamKey,
      }));
      break;
    }

    case "BlogClosed": {
      const tableName = requireEnv("DELIVERY_BLOGS_TABLE");

      // Get current blog state and update status
      const existing = await client.send(
        new GetCommand({ TableName: tableName, Key: { blogId: parsed.blogId } }),
      );
      if (existing.Item) {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: { ...existing.Item, status: "closed" },
          }),
        );
      }

      // Publish to Redis pub/sub for WebSocket teardown
      const closedChannel = REDIS_CHANNELS.blogClosed(parsed.blogId);
      await r.publish(
        closedChannel,
        JSON.stringify({ blogId: parsed.blogId, closedAt: parsed.closedAt }),
      );

      console.log(JSON.stringify({
        level: "info",
        msg: "Blog closed — delivery updated + WS teardown signal sent",
        blogId: parsed.blogId,
      }));
      break;
    }
  }
}
