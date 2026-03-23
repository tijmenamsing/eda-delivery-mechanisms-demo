import { Router } from "express";
import { randomUUID } from "node:crypto";
import { PostArticleRequestSchema } from "@newswire/types/api";
import type { Article } from "@newswire/types/models";
import type { ArticlePublishedEvent } from "@newswire/types/events";
import type { EventPublisher } from "../lib/events/publisher.interface.js";
import { putItem, scanItems } from "../lib/dynamo.js";
import { env } from "../lib/env.js";
import { validate } from "../middleware/validate.js";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createArticlesRouter(publisher: EventPublisher): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const articles = await scanItems<Article>(env.ARTICLES_TABLE);
      articles.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() -
          new Date(a.publishedAt).getTime(),
      );
      res.json({ articles });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/",
    validate(PostArticleRequestSchema),
    async (req, res, next) => {
      try {
        const { title, content, author } = req.body as {
          title: string;
          content: string;
          author: string;
        };

        const article: Article = {
          articleId: randomUUID(),
          title: title.trim(),
          content: content.trim(),
          author: author.trim(),
          publishedAt: new Date().toISOString(),
          slug: slugify(title),
        };

        await putItem(env.ARTICLES_TABLE, article);

        const event: ArticlePublishedEvent = {
          type: "ArticlePublished",
          articleId: article.articleId,
          title: article.title,
          author: article.author,
          publishedAt: article.publishedAt,
        };
        await publisher.publish(event);

        req.log?.info(
          { articleId: article.articleId },
          "Article published",
        );
        res.status(201).json({ article });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
