// Event consumer Lambda handler — bridges EventBridge → Redis pub/sub.
//
// This file is bundled by esbuild (via NodejsFunction) so it can import
// workspace packages and npm dependencies directly. It does NOT run in the
// infra tsconfig's module system — esbuild produces a self-contained bundle.

import Redis from "ioredis";
import { UpdatePostedEventSchema } from "@bbtg-news/types/events";
import { REDIS_CHANNELS } from "@bbtg-news/types/constants";

// Reuse the Redis connection across Lambda invocations (warm start optimisation).
let redis: Redis | null = null;

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

interface EventBridgeEvent {
  readonly source: string;
  readonly "detail-type": string;
  readonly detail: unknown;
}

export async function handler(event: EventBridgeEvent): Promise<void> {
  const parsed = UpdatePostedEventSchema.parse(event.detail);

  const channel = REDIS_CHANNELS.blogUpdates(parsed.blogId);
  const payload = JSON.stringify(parsed);

  await getRedis().publish(channel, payload);

  console.log(
    JSON.stringify({
      level: "info",
      msg: "Published update to Redis",
      updateId: parsed.updateId,
      blogId: parsed.blogId,
      channel,
    }),
  );
}
