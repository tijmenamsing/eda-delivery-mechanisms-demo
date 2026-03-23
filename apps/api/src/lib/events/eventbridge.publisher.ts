import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import type { EventPublisher, DomainEvent } from "./publisher.interface.js";
import { env } from "../env.js";
import { logger } from "../logger.js";

const client = new EventBridgeClient({ region: env.AWS_REGION });

export class EventBridgePublisher implements EventPublisher {
  async publish(event: DomainEvent): Promise<void> {
    const busName = env.EVENTBRIDGE_BUS_NAME;
    if (!busName) {
      throw new Error("EVENTBRIDGE_BUS_NAME is not configured");
    }

    await client.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: "newswire.api",
            DetailType: event.type,
            Detail: JSON.stringify(event),
            EventBusName: busName,
          },
        ],
      }),
    );

    logger.info(
      { eventType: event.type, busName },
      "Published event to EventBridge",
    );
  }
}
