import { REDIS_CHANNELS, REDIS_STREAMS } from "@bbtg-news/types/constants";
import type { DomainEvent } from "@bbtg-news/types/events";
import type { EventPublisher } from "./publisher.interface.js";
import { getRedisClient, xadd } from "../redis.js";
import { putItem } from "../dynamo.js";
import { env } from "../env.js";
import { logger } from "../logger.js";

/**
 * In local dev, the InProcessPublisher simulates the full Consumer Lambda flow:
 * it materializes events into delivery tables and writes to Redis Streams/pub-sub.
 * This way, local dev behaves identically to production without needing EventBridge.
 */
export class InProcessPublisher implements EventPublisher {
  async publish(event: DomainEvent): Promise<void> {
    switch (event.type) {
      case "ArticlePublished": {
        // Materialize article into delivery read model
        await putItem(env.DELIVERY_ARTICLES_TABLE, {
          articleId: event.articleId,
          title: event.title,
          content: event.content,
          slug: event.slug,
          author: event.author,
          publishedAt: event.publishedAt,
        });
        logger.info(
          { eventType: event.type, articleId: event.articleId },
          "Materialized article into delivery table",
        );
        break;
      }

      case "UpdatePosted": {
        // Materialize update into delivery read model
        await putItem(env.DELIVERY_UPDATES_TABLE, {
          updateId: event.updateId,
          blogId: event.blogId,
          content: event.content,
          author: event.author,
          minute: event.minute,
          type: event.updateType,
          postedAt: event.postedAt,
        });

        // XADD to Redis Stream for SSE delivery
        const streamKey = REDIS_STREAMS.blogUpdates(event.blogId);
        const payload = JSON.stringify({
          updateId: event.updateId,
          blogId: event.blogId,
          content: event.content,
          author: event.author,
          minute: event.minute,
          type: event.updateType,
          postedAt: event.postedAt,
        });
        await xadd(streamKey, { payload });

        logger.info(
          { eventType: event.type, updateId: event.updateId, blogId: event.blogId, streamKey },
          "Materialized update + added to Redis Stream",
        );
        break;
      }

      case "BlogClosed": {
        // Update blog status in delivery read model
        // In a real consumer Lambda we'd do a DynamoDB update expression,
        // but here we just get + put for simplicity
        const { getItem } = await import("../dynamo.js");
        const blog = await getItem<Record<string, unknown>>(
          env.DELIVERY_BLOGS_TABLE,
          { blogId: event.blogId },
        );
        if (blog) {
          await putItem(env.DELIVERY_BLOGS_TABLE, {
            ...blog,
            status: "closed",
          });
        }

        // Publish to Redis pub/sub channel for WebSocket teardown
        const closedChannel = REDIS_CHANNELS.blogClosed(event.blogId);
        await getRedisClient().publish(
          closedChannel,
          JSON.stringify({ blogId: event.blogId, closedAt: event.closedAt }),
        );

        logger.info(
          { eventType: event.type, blogId: event.blogId },
          "Blog closed — delivery updated + WS teardown signal sent",
        );
        break;
      }
    }
  }
}
