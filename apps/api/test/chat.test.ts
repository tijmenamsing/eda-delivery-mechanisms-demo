import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { createChatRouter } from "../src/routes/chat.js";
import { errorHandler } from "../src/middleware/error.js";

vi.mock("../src/lib/env.js", () => ({
  env: {
    CHAT_MESSAGES_TABLE: "test-chat-messages",
    NODE_ENV: "test",
  },
}));

const mockQueryItems = vi.fn();

vi.mock("../src/lib/dynamo.js", () => ({
  queryItems: (...args: unknown[]) => mockQueryItems(...args),
}));

vi.mock("../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

describe("Chat routes", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/chat", createChatRouter());
    app.use(errorHandler);
  });

  describe("GET /chat/:blogId/messages", () => {
    it("returns messages sorted by postedAt ascending", async () => {
      const messages = [
        {
          messageId: "m1",
          blogId: "b1",
          author: "Alice",
          content: "Hello",
          postedAt: "2026-04-15T14:00:00.000Z",
        },
        {
          messageId: "m2",
          blogId: "b1",
          author: "Bob",
          content: "Hi there",
          postedAt: "2026-04-15T14:01:00.000Z",
        },
      ];
      mockQueryItems.mockResolvedValue(messages);

      const res = await request(app)
        .get("/chat/b1/messages")
        .expect(200);

      expect(res.body.messages).toHaveLength(2);
      expect(res.body.messages[0].author).toBe("Alice");
      expect(res.body.messages[1].author).toBe("Bob");
      expect(mockQueryItems).toHaveBeenCalledWith(
        "test-chat-messages",
        "blogId = :blogId",
        { ":blogId": "b1" },
        "blogId-postedAt-index",
      );
    });

    it("returns empty array when no messages exist", async () => {
      mockQueryItems.mockResolvedValue([]);

      const res = await request(app)
        .get("/chat/nonexistent/messages")
        .expect(200);

      expect(res.body.messages).toEqual([]);
    });

    it("limits to 50 messages", async () => {
      const messages = Array.from({ length: 60 }, (_, i) => ({
        messageId: `m${i}`,
        blogId: "b1",
        author: "User",
        content: `Message ${i}`,
        postedAt: `2026-04-15T14:${String(i).padStart(2, "0")}:00.000Z`,
      }));
      mockQueryItems.mockResolvedValue(messages);

      const res = await request(app)
        .get("/chat/b1/messages")
        .expect(200);

      expect(res.body.messages).toHaveLength(50);
      // Should return the LAST 50 (most recent)
      expect(res.body.messages[0].messageId).toBe("m10");
      expect(res.body.messages[49].messageId).toBe("m59");
    });
  });
});
