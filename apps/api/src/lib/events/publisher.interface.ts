import type { ArticlePublishedEvent, UpdatePostedEvent } from "@bbtg-news/types/events";

export type DomainEvent = ArticlePublishedEvent | UpdatePostedEvent;

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
