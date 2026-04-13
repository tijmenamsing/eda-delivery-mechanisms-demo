import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { createBlogsRouter } from "../src/routes/blogs.js";
import { errorHandler } from "../src/middleware/error.js";
import type { EventPublisher } from "../src/lib/events/publisher.interface.js";

vi.mock("../src/lib/env.js", () => ({
  env: {
    EDITORIAL_BLOGS_TABLE: "test-editorial-blogs",
    DELIVERY_BLOGS_TABLE: "test-delivery-blogs",
    DELIVERY_UPDATES_TABLE: "test-delivery-updates",
    NODE_ENV: "test",
  },
}));

const mockScanItems = vi.fn();
const mockGetItem = vi.fn();
const mockQueryItems = vi.fn();

const mockPutItem = vi.fn();

vi.mock("../src/lib/dynamo.js", () => ({
  scanItems: (...args: unknown[]) => mockScanItems(...args),
  getItem: (...args: unknown[]) => mockGetItem(...args),
  queryItems: (...args: unknown[]) => mockQueryItems(...args),
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

describe("Blogs routes", () => {
  let app: express.Express;
  let mockPublisher: EventPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
    app = express();
    app.use(express.json());
    app.use("/blogs", createBlogsRouter(mockPublisher));
    app.use(errorHandler);
  });

  describe("GET /blogs", () => {
    it("returns list of blogs", async () => {
      const blogs = [
        {
          blogId: "1",
          title: "Live: BBTG Kennisfestival 2026",
          eventName: "BBTG Kennisfestival 2026",
          eventDate: "2026-04-15",
          eventLocation: "Zeist",
          status: "active",
          createdAt: "2026-04-15T00:00:00.000Z",
        },
      ];
      mockScanItems.mockResolvedValue(blogs);

      const res = await request(app).get("/blogs").expect(200);

      expect(res.body.blogs).toHaveLength(1);
      expect(res.body.blogs[0].title).toBe("Live: BBTG Kennisfestival 2026");
    });
  });

  describe("GET /blogs/:blogId", () => {
    it("returns blog with updates", async () => {
      const blog = {
        blogId: "1",
        title: "Live: BBTG Kennisfestival 2026",
        eventName: "BBTG Kennisfestival 2026",
        eventDate: "2026-04-15",
        eventLocation: "Zeist",
        status: "active",
        createdAt: "2026-04-15T00:00:00.000Z",
      };
      const updates = [
        {
          updateId: "u1",
          blogId: "1",
          content: "Welkom bij het BBTG Kennisfestival!",
          author: "Reporter",
          minute: 0,
          type: "commentary",
          postedAt: "2026-04-15T09:00:00.000Z",
        },
      ];
      mockGetItem.mockResolvedValue(blog);
      mockQueryItems.mockResolvedValue(updates);

      const res = await request(app).get("/blogs/1").expect(200);

      expect(res.body.blog.title).toBe("Live: BBTG Kennisfestival 2026");
      expect(res.body.updates).toHaveLength(1);
    });

    it("returns 404 if blog not found", async () => {
      mockGetItem.mockResolvedValue(null);

      const res = await request(app).get("/blogs/nonexistent").expect(404);

      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("POST /blogs/:blogId/close", () => {
    it("closes a blog, calls publisher, returns 200", async () => {
      const blog = {
        blogId: "1",
        title: "Live: BBTG Kennisfestival 2026",
        eventName: "BBTG Kennisfestival 2026",
        eventDate: "2026-04-15",
        eventLocation: "Zeist",
        status: "active",
        createdAt: "2026-04-15T00:00:00.000Z",
      };
      mockGetItem.mockResolvedValue(blog);
      mockPutItem.mockResolvedValue(undefined);

      const res = await request(app).post("/blogs/1/close").expect(200);

      expect(res.body.blog.status).toBe("closed");
      expect(mockPutItem).toHaveBeenCalledOnce();
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: "BlogClosed", blogId: "1" }),
      );
    });

    it("returns 404 if blog not found", async () => {
      mockGetItem.mockResolvedValue(null);

      const res = await request(app).post("/blogs/nonexistent/close").expect(404);

      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 400 if blog is already closed", async () => {
      const blog = {
        blogId: "1",
        title: "Test",
        status: "closed",
        createdAt: "2026-04-15T00:00:00.000Z",
      };
      mockGetItem.mockResolvedValue(blog);

      const res = await request(app).post("/blogs/1/close").expect(400);

      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
