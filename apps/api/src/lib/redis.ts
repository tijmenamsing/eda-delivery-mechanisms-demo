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

// ------------------------------------------------------------------ //
// Redis Streams helpers
// ------------------------------------------------------------------ //

export interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

/** Append an entry to a Redis Stream. Returns the auto-generated entry ID. */
export async function xadd(
  streamKey: string,
  fields: Record<string, string>,
): Promise<string> {
  const redis = getRedisClient();
  const args: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    args.push(k, v);
  }
  const id = await redis.xadd(streamKey, "*", ...args);
  return id as string;
}

/** Read a range of entries from a Redis Stream (inclusive). */
export async function xrange(
  streamKey: string,
  start: string,
  end: string,
): Promise<StreamEntry[]> {
  const raw = await getRedisClient().xrange(streamKey, start, end);
  return parseStreamEntries(raw);
}

/**
 * Blocking read from a Redis Stream. Returns entries added after `lastId`.
 * Uses a dedicated client to avoid blocking the shared connection.
 * Returns null if the timeout fires with no new entries.
 */
export async function xread(
  client: Redis,
  streamKey: string,
  lastId: string,
  blockMs: number,
): Promise<StreamEntry[] | null> {
  const result = await client.xread(
    "COUNT", "100",
    "BLOCK", blockMs,
    "STREAMS", streamKey, lastId,
  );
  if (!result || result.length === 0) return null;
  // result shape: [[streamKey, entries]]
  const streamData = result[0];
  if (!streamData || !streamData[1]) return null;
  return parseStreamEntries(streamData[1] as Array<[string, string[]]>);
}

function parseStreamEntries(
  raw: Array<[string, string[]]>,
): StreamEntry[] {
  return raw.map(([id, fieldArray]) => {
    const fields: Record<string, string> = {};
    for (let i = 0; i < fieldArray.length; i += 2) {
      const key = fieldArray[i];
      const value = fieldArray[i + 1];
      if (key !== undefined && value !== undefined) {
        fields[key] = value;
      }
    }
    return { id, fields };
  });
}
