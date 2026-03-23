import Redis from "ioredis";
import { env } from "./env.js";

let sharedClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!sharedClient) {
    sharedClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  }
  return sharedClient;
}

// Each SSE subscriber needs a dedicated connection — never share a pub/sub client
export function createSubscriberClient(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
}

export async function disconnectRedis(): Promise<void> {
  if (sharedClient) {
    await sharedClient.quit();
    sharedClient = null;
  }
}
