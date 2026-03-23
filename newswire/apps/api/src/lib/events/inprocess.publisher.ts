import { REDIS_CHANNELS } from "@newswire/types/constants";
import type { EventPublisher, DomainEvent } from "./publisher.interface.js";
import { getRedisClient } from "../redis.js";
import { logger } from "../logger.js";

export class InProcessPublisher implements EventPublisher {
  async publish(event: DomainEvent): Promise<void> {
    if (event.type === "UpdatePosted") {
      const channel = REDIS_CHANNELS.blogUpdates(event.blogId);
      const payload = JSON.stringify(event);
      await getRedisClient().publish(channel, payload);
      logger.info(
        { eventType: event.type, channel, updateId: event.updateId },
        "Published update to Redis",
      );
    } else {
      logger.info(
        { eventType: event.type, articleId: event.articleId },
        "ArticlePublished event received (no-op in local mode)",
      );
    }
  }
}
