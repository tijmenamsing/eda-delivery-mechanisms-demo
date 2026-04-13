import { Router } from "express";
import type { Blog, BlogUpdate } from "@bbtg-news/types/models";
import type { BlogClosedEvent } from "@bbtg-news/types/events";
import type { EventPublisher } from "../lib/events/publisher.interface.js";
import { getItem, putItem, scanItems, queryItems } from "../lib/dynamo.js";
import { env } from "../lib/env.js";

export function createBlogsRouter(publisher: EventPublisher): Router {
  const router = Router();

  // GET reads from the Delivery context (materialized read model)
  router.get("/", async (_req, res, next) => {
    try {
      const blogs = await scanItems<Blog>(env.DELIVERY_BLOGS_TABLE);
      res.json({ blogs });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:blogId", async (req, res, next) => {
    try {
      const { blogId } = req.params;
      if (!blogId) {
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "blogId is required" },
        });
        return;
      }

      const blog = await getItem<Blog>(env.DELIVERY_BLOGS_TABLE, { blogId });
      if (!blog) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Blog not found" },
        });
        return;
      }

      const updates = await queryItems<BlogUpdate>(
        env.DELIVERY_UPDATES_TABLE,
        "blogId = :blogId",
        { ":blogId": blogId },
        "blogId-postedAt-index",
      );

      // Sort by postedAt ascending
      updates.sort(
        (a, b) =>
          new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime(),
      );

      res.json({ blog, updates });
    } catch (err) {
      next(err);
    }
  });

  // POST close writes to the Editorial context (source of truth)
  router.post("/:blogId/close", async (req, res, next) => {
    try {
      const { blogId } = req.params;
      if (!blogId) {
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "blogId is required" },
        });
        return;
      }

      const blog = await getItem<Blog>(env.EDITORIAL_BLOGS_TABLE, { blogId });
      if (!blog) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Blog not found" },
        });
        return;
      }

      if (blog.status === "closed") {
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Blog is already closed" },
        });
        return;
      }

      const closedBlog: Blog = { ...blog, status: "closed" };
      await putItem(env.EDITORIAL_BLOGS_TABLE, closedBlog);

      const event: BlogClosedEvent = {
        type: "BlogClosed",
        blogId,
        closedAt: new Date().toISOString(),
      };
      await publisher.publish(event);

      req.log?.info({ blogId }, "Blog closed");
      res.json({ blog: closedBlog });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
