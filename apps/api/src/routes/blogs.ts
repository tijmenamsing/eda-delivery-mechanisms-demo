import { Router } from "express";
import type { Blog, BlogUpdate } from "@bbtg-news/types/models";
import { getItem, scanItems, queryItems } from "../lib/dynamo.js";
import { env } from "../lib/env.js";

export function createBlogsRouter(): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const blogs = await scanItems<Blog>(env.BLOGS_TABLE);
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

      const blog = await getItem<Blog>(env.BLOGS_TABLE, { blogId });
      if (!blog) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Blog not found" },
        });
        return;
      }

      const updates = await queryItems<BlogUpdate>(
        env.UPDATES_TABLE,
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

  return router;
}
