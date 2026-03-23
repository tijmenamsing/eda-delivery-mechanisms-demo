import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { createArticlesRouter } from "../src/routes/articles.js";
import { errorHandler } from "../src/middleware/error.js";
import type { EventPublisher } from "../src/lib/events/publisher.interface.js";

vi.mock("../src/lib/env.js", () => ({
  env: {
    ARTICLES_TABLE: "test-articles",
    NODE_ENV: "test",
  },
}));

const mockScanItems = vi.fn();
const mockPutItem = vi.fn();

vi.mock("../src/lib/dynamo.js", () => ({
  scanItems: (...args: unknown[]) => mockScanItems(...args),
  putItem: (...args: unknown[]) => mockPutItem(...args),
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

describe("Articles routes", () => {
  let app: express.Express;
  let mockPublisher: EventPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
    app = express();
    app.use(express.json());
    app.use("/articles", createArticlesRouter(mockPublisher));
    app.use(errorHandler);
  });

  describe("GET /articles", () => {
    it("returns sorted articles", async () => {
      const articles = [
        {
          articleId: "1",
          title: "Older",
          content: "c",
          author: "a",
          publishedAt: "2024-01-01T00:00:00.000Z",
          slug: "older",
        },
        {
          articleId: "2",
          title: "Newer",
          content: "c",
          author: "a",
          publishedAt: "2024-06-01T00:00:00.000Z",
          slug: "newer",
        },
      ];
      mockScanItems.mockResolvedValue(articles);

      const res = await request(app).get("/articles").expect(200);

      expect(res.body.articles).toHaveLength(2);
      expect(res.body.articles[0].title).toBe("Newer");
      expect(res.body.articles[1].title).toBe("Older");
    });
  });

  describe("POST /articles", () => {
    it("creates article, calls publisher, returns 201", async () => {
      mockPutItem.mockResolvedValue(undefined);

      const res = await request(app)
        .post("/articles")
        .send({
          title: "Test Article",
          content: "Test content",
          author: "Test Author",
        })
        .expect(201);

      expect(res.body.article).toBeDefined();
      expect(res.body.article.title).toBe("Test Article");
      expect(res.body.article.slug).toBe("test-article");
      expect(mockPutItem).toHaveBeenCalledOnce();
      expect(mockPublisher.publish).toHaveBeenCalledOnce();
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: "ArticlePublished" }),
      );
    });

    it("returns 400 with invalid body", async () => {
      const res = await request(app)
        .post("/articles")
        .send({ title: "" })
        .expect(400);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
