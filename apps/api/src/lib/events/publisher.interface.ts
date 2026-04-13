import type { DomainEvent } from "@bbtg-news/types/events";

export type { DomainEvent };

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
