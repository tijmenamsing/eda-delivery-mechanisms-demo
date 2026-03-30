import { Router } from "express";
import { queryItems } from "../lib/dynamo.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import type { ChatMessage } from "@bbtg-news/types/models";

const HISTORY_LIMIT = 50;

export function createChatRouter(): Router {
  const router = Router();

  // GET /chat/:blogId/messages — returns last 50 chat messages
  router.get("/:blogId/messages", async (req, res, next) => {
    try {
      const { blogId } = req.params;
      const log = req.log ?? logger;

      if (!blogId) {
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "blogId is required" },
        });
        return;
      }

      const messages = await queryItems<ChatMessage>(
        env.CHAT_MESSAGES_TABLE,
        "blogId = :blogId",
        { ":blogId": blogId },
        "blogId-postedAt-index",
      );

      // Return only the last N messages, sorted ascending by postedAt
      const recent = messages.slice(-HISTORY_LIMIT);

      log.debug({ blogId, count: recent.length }, "Chat history fetched");

      res.json({ messages: recent });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
