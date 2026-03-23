import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { createUpdatesRouter } from "../src/routes/updates.js";
import { errorHandler } from "../src/middleware/error.js";
import type { EventPublisher } from "../src/lib/events/publisher.interface.js";

vi.mock("../src/lib/env.js", () => ({
  env: {
    UPDATES_TABLE: "test-updates",
    BLOGS_TABLE: "test-blogs",
    NODE_ENV: "test",
  },
}));

const mockPutItem = vi.fn();
const mockGetItem = vi.fn();

vi.mock("../src/lib/dynamo.js", () => ({
  putItem: (...args: unknown[]) => mockPutItem(...args),
  getItem: (...args: unknown[]) => mockGetItem(...args),
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

const validUpdate = {
  blogId: "550e8400-e29b-41d4-a716-446655440000",
  content: "Goal! Ajax 1-0 PSV",
  author: "Reporter",
  minute: 23,
  type: "goal" as const,
};

describe("Updates routes", () => {
  let app: express.Express;
  let mockPublisher: EventPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
    app = express();
    app.use(express.json());
    app.use("/updates", createUpdatesRouter(mockPublisher));
    app.use(errorHandler);
  });

  describe("POST /updates", () => {
    it("creates update, calls publisher, returns 201", async () => {
      mockGetItem.mockResolvedValue({
        blogId: validUpdate.blogId,
        title: "Test Blog",
        status: "active",
      });
      mockPutItem.mockResolvedValue(undefined);

      const res = await request(app)
        .post("/updates")
        .send(validUpdate)
        .expect(201);

      expect(res.body.update).toBeDefined();
      expect(res.body.update.content).toBe("Goal! Ajax 1-0 PSV");
      expect(res.body.update.type).toBe("goal");
      expect(mockPutItem).toHaveBeenCalledOnce();
      expect(mockPublisher.publish).toHaveBeenCalledOnce();
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: "UpdatePosted" }),
      );
    });

    it("returns 400 with invalid body", async () => {
      const res = await request(app)
        .post("/updates")
        .send({ content: "missing fields" })
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 with unknown blogId", async () => {
      mockGetItem.mockResolvedValue(null);

      const res = await request(app)
        .post("/updates")
        .send(validUpdate)
        .expect(404);

      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });
});
