import type { WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { REDIS_CHANNELS, WS_EVENTS, WS_CLOSE_CODES } from "@bbtg-news/types/constants";
import { SendChatMessageRequestSchema } from "@bbtg-news/types/api";
import type { ChatMessage } from "@bbtg-news/types/models";
import { getRedisClient, createSubscriberClient } from "../lib/redis.js";
import { putItem, getItem, queryItems } from "../lib/dynamo.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import type { Blog } from "@bbtg-news/types/models";

const HISTORY_LIMIT = 50;
const RATE_LIMIT_MS = 1000;
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

export async function handleChatConnection(
  ws: WebSocket,
  req: IncomingMessage,
  blogId: string,
): Promise<void> {
  const log = logger.child({ blogId, connectionId: randomUUID().slice(0, 8) });

  // Verify the blog exists
  const blog = await getItem<Blog>(env.BLOGS_TABLE, { blogId });
  if (!blog) {
    log.warn("Blog not found, closing connection");
    ws.close(WS_CLOSE_CODES.BLOG_NOT_FOUND, "Blog not found");
    return;
  }

  log.info("WebSocket chat connection opened");

  // Send chat history
  const messages = await queryItems<ChatMessage>(
    env.CHAT_MESSAGES_TABLE,
    "blogId = :blogId",
    { ":blogId": blogId },
    "blogId-postedAt-index",
  );
  const recent = messages.slice(-HISTORY_LIMIT);

  ws.send(
    JSON.stringify({ event: WS_EVENTS.HISTORY, data: recent }),
  );

  // Subscribe to Redis channel for this blog's chat
  const subscriber = createSubscriberClient();
  const channel = REDIS_CHANNELS.chatMessages(blogId);

  await subscriber.subscribe(channel).catch((err: unknown) => {
    log.error({ err, channel }, "Failed to subscribe to chat channel");
    ws.close(WS_CLOSE_CODES.SERVER_ERROR, "Subscription failed");
  });

  // Forward Redis messages to this WebSocket client
  subscriber.on("message", (ch: string, message: string) => {
    if (ch === channel && ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({ event: WS_EVENTS.MESSAGE, data: JSON.parse(message) }),
      );
    }
  });

  // Rate limiting state
  let lastMessageAt = 0;

  // Handle incoming messages from the client
  ws.on("message", async (raw: Buffer | string) => {
    try {
      const now = Date.now();
      if (now - lastMessageAt < RATE_LIMIT_MS) {
        ws.send(
          JSON.stringify({
            event: WS_EVENTS.ERROR,
            data: { message: "Te snel — wacht even voor het volgende bericht" },
          }),
        );
        return;
      }
      lastMessageAt = now;

      const parsed = JSON.parse(
        typeof raw === "string" ? raw : raw.toString("utf-8"),
      ) as unknown;

      const result = SendChatMessageRequestSchema.safeParse(parsed);
      if (!result.success) {
        ws.send(
          JSON.stringify({
            event: WS_EVENTS.ERROR,
            data: { message: "Ongeldig bericht", details: result.error.issues },
          }),
        );
        return;
      }

      const chatMessage: ChatMessage = {
        messageId: randomUUID(),
        blogId,
        author: result.data.author.trim(),
        content: result.data.content.trim(),
        postedAt: new Date().toISOString(),
      };

      // Store in DynamoDB with 24h TTL
      await putItem(env.CHAT_MESSAGES_TABLE, {
        ...chatMessage,
        ttl: Math.floor(Date.now() / 1000) + 86400,
      });

      // Broadcast via Redis (all ECS nodes including this one will receive it)
      await getRedisClient().publish(channel, JSON.stringify(chatMessage));

      log.debug(
        { messageId: chatMessage.messageId },
        "Chat message processed",
      );
    } catch (err) {
      log.error({ err }, "Error processing chat message");
      ws.send(
        JSON.stringify({
          event: WS_EVENTS.ERROR,
          data: { message: "Fout bij verwerken bericht" },
        }),
      );
    }
  });

  // Ping/pong keepalive
  let isAlive = true;

  ws.on("pong", () => {
    isAlive = true;
  });

  const pingInterval = setInterval(() => {
    if (!isAlive) {
      log.info("Pong timeout — closing connection");
      ws.terminate();
      return;
    }
    isAlive = false;
    ws.ping();
  }, PING_INTERVAL_MS);

  // Cleanup on close
  ws.on("close", () => {
    clearInterval(pingInterval);
    try {
      const result = subscriber.unsubscribe(channel);
      if (result && typeof result === "object" && "catch" in result) {
        (result as Promise<unknown>).catch(() => {});
      }
    } catch {
      // Subscriber may already be disconnected
    }
    subscriber.disconnect();
    log.info("WebSocket chat connection closed");
  });

  ws.on("error", (err) => {
    log.error({ err }, "WebSocket error");
  });
}
