import { Router } from "express";
import { REDIS_CHANNELS, SSE_EVENTS } from "@newswire/types/constants";
import { createSubscriberClient } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

export function createStreamRouter(): Router {
  const router = Router();

  router.get("/:blogId", (req, res) => {
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

    // Send connected event
    res.write(
      `event: ${SSE_EVENTS.CONNECTED}\ndata: ${JSON.stringify({ blogId })}\n\n`,
    );

    // Create dedicated subscriber
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
      if (ch === channel) {
        res.write(`event: ${SSE_EVENTS.UPDATE}\ndata: ${message}\n\n`);
      }
    });

    // Keepalive every 30 seconds to prevent proxy/ALB timeout
    const keepalive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 30_000);

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
