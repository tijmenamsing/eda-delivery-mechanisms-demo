import { Router } from "express";
import { randomUUID } from "node:crypto";
import { PostUpdateRequestSchema } from "@newswire/types/api";
import type { BlogUpdate } from "@newswire/types/models";
import type { UpdatePostedEvent } from "@newswire/types/events";
import type { EventPublisher } from "../lib/events/publisher.interface.js";
import { putItem, getItem } from "../lib/dynamo.js";
import { env } from "../lib/env.js";
import { validate } from "../middleware/validate.js";
import type { Blog } from "@newswire/types/models";

export function createUpdatesRouter(publisher: EventPublisher): Router {
  const router = Router();

  router.post(
    "/",
    validate(PostUpdateRequestSchema),
    async (req, res, next) => {
      try {
        const { blogId, content, author, minute, type } = req.body as {
          blogId: string;
          content: string;
          author: string;
          minute: number | null;
          type: BlogUpdate["type"];
        };

        // Verify blog exists
        const blog = await getItem<Blog>(env.BLOGS_TABLE, { blogId });
        if (!blog) {
          res.status(404).json({
            error: { code: "NOT_FOUND", message: "Blog not found" },
          });
          return;
        }

        const update: BlogUpdate = {
          updateId: randomUUID(),
          blogId,
          content: content.trim(),
          author: author.trim(),
          minute,
          type,
          postedAt: new Date().toISOString(),
        };

        await putItem(env.UPDATES_TABLE, update);

        const event: UpdatePostedEvent = {
          type: "UpdatePosted",
          updateId: update.updateId,
          blogId: update.blogId,
          content: update.content,
          author: update.author,
          minute: update.minute,
          updateType: update.type,
          postedAt: update.postedAt,
        };
        await publisher.publish(event);

        req.log?.info(
          { updateId: update.updateId, blogId },
          "Update posted",
        );
        res.status(201).json({ update });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
