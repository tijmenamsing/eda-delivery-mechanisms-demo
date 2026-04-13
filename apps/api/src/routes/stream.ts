import { Router } from "express";
import { REDIS_STREAMS, SSE_EVENTS } from "@bbtg-news/types/constants";
import { createSubscriberClient } from "../lib/redis.js";
import { xrange, xread } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

// CloudFront read timeout is 30s — keepalive must fire well before that.
const KEEPALIVE_INTERVAL_MS = 15_000;
// Browser reconnect delay (milliseconds) sent as SSE retry field.
const SSE_RETRY_MS = 3_000;
// XREAD BLOCK timeout — short so we can check the running flag between iterations.
const XREAD_BLOCK_MS = 2_000;

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
    const streamKey = REDIS_STREAMS.blogUpdates(blogId);

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

    // Immediate keepalive so CloudFront doesn't time out before the first interval
    res.write(": keepalive\n\n");

    // Determine the starting stream ID.
    // - New connection: replay all history from "0"
    // - Reconnection (Last-Event-ID present): resume from that stream entry ID
    const lastEventId = req.headers["last-event-id"];
    let lastId = "0";
    if (typeof lastEventId === "string" && lastEventId.length > 0) {
      lastId = lastEventId;
      log.info({ blogId, lastEventId }, "SSE reconnection — resuming from Last-Event-ID");
    }

    // Replay history from the stream
    try {
      // XRANGE from (lastId to "+") to get all entries. For new connections,
      // lastId is "0" so we get everything. For reconnections, we want entries
      // AFTER lastId, so we use an exclusive start by appending to the ID.
      const rangeStart = lastId === "0" ? "-" : `(${lastId}`;
      const history = await xrange(streamKey, rangeStart, "+");
      for (const entry of history) {
        const payload = entry.fields["payload"];
        if (payload) {
          res.write(
            `id: ${entry.id}\nevent: ${SSE_EVENTS.UPDATE}\ndata: ${payload}\n\n`,
          );
        }
      }
      if (history.length > 0) {
        lastId = history[history.length - 1]!.id;
        log.info(
          { blogId, replayed: history.length },
          "Replayed SSE updates from Redis Stream",
        );
      }
    } catch (err) {
      log.error({ err }, "Failed to replay SSE updates from Redis Stream");
    }

    // Create a dedicated client for blocking reads
    const reader = createSubscriberClient();
    let running = true;

    // Keepalive comments to prevent proxy timeouts
    const keepalive = setInterval(() => {
      if (running) {
        res.write(": keepalive\n\n");
      }
    }, KEEPALIVE_INTERVAL_MS);

    log.info({ blogId, streamKey }, "SSE connection opened");

    // XREAD BLOCK loop in the background
    const readLoop = async (): Promise<void> => {
      while (running) {
        try {
          const entries = await xread(reader, streamKey, lastId, XREAD_BLOCK_MS);
          if (!entries || !running) continue;

          for (const entry of entries) {
            const payload = entry.fields["payload"];
            if (payload && running) {
              res.write(
                `id: ${entry.id}\nevent: ${SSE_EVENTS.UPDATE}\ndata: ${payload}\n\n`,
              );
              lastId = entry.id;
            }
          }
        } catch (err) {
          if (!running) break;
          log.error({ err, blogId }, "Error in SSE XREAD loop");
          // Brief pause before retrying to avoid tight error loop
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    };

    readLoop().catch((err) => {
      if (running) {
        log.error({ err, blogId }, "SSE read loop terminated unexpectedly");
      }
    });

    req.on("close", () => {
      running = false;
      clearInterval(keepalive);
      reader.disconnect();
      log.info({ blogId }, "SSE connection closed");
    });
  });

  return router;
}
