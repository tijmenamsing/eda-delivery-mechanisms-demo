import { Router } from "express";
import { REDIS_CHANNELS, SSE_EVENTS } from "@bbtg-news/types/constants";
import { createSubscriberClient } from "../lib/redis.js";
import { getItem, queryItems } from "../lib/dynamo.js";
import { logger } from "../lib/logger.js";
import { env } from "../lib/env.js";
import type { BlogUpdate } from "@bbtg-news/types/models";

// CloudFront read timeout is 30s — keepalive must fire well before that.
const KEEPALIVE_INTERVAL_MS = 15_000;
// Browser reconnect delay (milliseconds) sent as SSE retry field.
const SSE_RETRY_MS = 3_000;

export function createStreamRouter(): Router {
  const router = Router();

  router.get("/:blogId", async (req, res) => {
    const { blogId } = req.params;
    if (!blogId) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "blogId is required" },
      });
      return;
    }

    const log = req.log ?? logger;

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send connected event with retry hint
    res.write(
      `retry: ${SSE_RETRY_MS}\nevent: ${SSE_EVENTS.CONNECTED}\ndata: ${JSON.stringify({ blogId })}\n\n`,
    );

    // Immediate keepalive so CloudFront doesn't time out before the first
    // 15-second interval fires.
    res.write(": keepalive\n\n");

    // If the client reconnected after a disconnect, replay any updates it
    // missed. The browser's EventSource sends Last-Event-ID = the last updateId
    // we wrote as an SSE id: field.
    const lastEventId = req.headers["last-event-id"];
    if (typeof lastEventId === "string" && lastEventId.length > 0) {
      try {
        const lastUpdate = await getItem<BlogUpdate>(env.UPDATES_TABLE, {
          updateId: lastEventId,
        });
        if (lastUpdate) {
          const missed = await queryItems<BlogUpdate>(
            env.UPDATES_TABLE,
            "blogId = :blogId AND postedAt > :after",
            { ":blogId": blogId, ":after": lastUpdate.postedAt },
            "blogId-postedAt-index",
          );
          for (const u of missed) {
            res.write(
              `id: ${u.updateId}\nevent: ${SSE_EVENTS.UPDATE}\ndata: ${JSON.stringify(u)}\n\n`,
            );
          }
          if (missed.length > 0) {
            log.info(
              { blogId, replayed: missed.length, lastEventId },
              "Replayed missed SSE updates",
            );
          }
        }
      } catch (err) {
        log.error({ err, lastEventId }, "Failed to replay missed SSE updates");
      }
    }

    // Create dedicated subscriber (never reuse the shared publisher client)
    const subscriber = createSubscriberClient();
    const channel = REDIS_CHANNELS.blogUpdates(blogId);

    subscriber.subscribe(channel).catch((err: unknown) => {
      log.error({ err, channel }, "Failed to subscribe to Redis channel");
      res.write(
        `event: ${SSE_EVENTS.ERROR}\ndata: ${JSON.stringify({ message: "Subscription failed" })}\n\n`,
      );
      res.end();
    });

    subscriber.on("message", (ch: string, message: string) => {
      if (ch !== channel) return;
      try {
        const parsed = JSON.parse(message) as { updateId?: string };
        const id = parsed.updateId ?? "";
        res.write(
          `id: ${id}\nevent: ${SSE_EVENTS.UPDATE}\ndata: ${message}\n\n`,
        );
      } catch {
        res.write(`event: ${SSE_EVENTS.UPDATE}\ndata: ${message}\n\n`);
      }
    });

    // Send keepalive comments at a short interval to prevent CloudFront and
    // ALB from closing idle connections (CloudFront read timeout = 30s).
    const keepalive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, KEEPALIVE_INTERVAL_MS);

    log.info({ blogId, channel }, "SSE connection opened");

    req.on("close", () => {
      clearInterval(keepalive);
      try {
        const result = subscriber.unsubscribe(channel);
        if (result && typeof result === "object" && "catch" in result) {
          (result as Promise<unknown>).catch(() => {
            // Connection is closing, safe to ignore
          });
        }
      } catch {
        // Subscriber may already be disconnected
      }
      subscriber.disconnect();
      log.info({ blogId }, "SSE connection closed");
    });
  });

  return router;
}
