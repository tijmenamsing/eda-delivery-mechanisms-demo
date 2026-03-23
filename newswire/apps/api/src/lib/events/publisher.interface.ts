import type { ArticlePublishedEvent, UpdatePostedEvent } from "@newswire/types/events";

export type DomainEvent = ArticlePublishedEvent | UpdatePostedEvent;

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
