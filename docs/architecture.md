# Architecture

## Overview

NewsWire is a digital news platform demonstrating two real-time delivery patterns in an event-driven architecture:

1. **Homepage (polling)** — Articles are displayed via Next.js ISR with a 60-second revalidation interval
2. **Live blog (SSE)** — Match updates are pushed in real-time via Server-Sent Events through Redis pub/sub

## Key Design Decisions

### EventBridge stub pattern
The API always publishes events through an `EventPublisher` interface. In local development, the `InProcessPublisher` writes directly to Redis pub/sub. In production, the `EventBridgePublisher` sends events to AWS EventBridge, where a consumer Lambda bridges them to Redis.

### Redis pub/sub for SSE fan-out
Each SSE connection creates a dedicated Redis subscriber. This ensures that any ECS node can serve any connection, and the writer (Lambda/API) is fully decoupled from the reader (SSE endpoint).

### DynamoDB access patterns
- **Articles table**: Partition key `articleId`. Scan for homepage (acceptable at demo scale).
- **Blogs table**: Partition key `blogId`.
- **Updates table**: Partition key `updateId`. GSI `blogId-postedAt-index` for querying updates by blog.

### Lambda vs ECS
- Lambda: Short-lived, stateless work (authoring endpoints, article fetches)
- ECS Fargate: Long-lived SSE connections

In the local dev setup, everything runs in a single Express server.
