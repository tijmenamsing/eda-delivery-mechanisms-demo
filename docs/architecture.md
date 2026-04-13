# Architecture

## Overview

BBTG Nieuws is a digital news platform built to demonstrate how different delivery mechanisms behave in an event-driven architecture. The system implements three distinct patterns — polling, Server-Sent Events (SSE), and WebSocket — each chosen to match the real-time requirements of its use case.

The architecture follows a CQRS approach with two bounded contexts — **Editorial** (writes) and **Delivery** (reads) — communicating asynchronously through AWS EventBridge. This separation ensures that write-side concerns (validation, persistence, event publishing) never interfere with read-side concerns (query optimisation, real-time streaming, fan-out).

### Delivery mechanisms at a glance

| Mechanism     | Use case          | Latency              | Direction       | Infrastructure                               |
| ------------- | ----------------- | -------------------- | --------------- | -------------------------------------------- |
| **Polling**   | Homepage articles | ~10s (poll interval) | Client → Server | CloudFront → API Gateway → Lambda → DynamoDB |
| **SSE**       | Live blog updates | Sub-second           | Server → Client | CloudFront → ALB → ECS ← Redis Streams       |
| **WebSocket** | Live chat         | Sub-second           | Bidirectional   | CloudFront → ALB → ECS ← Redis pub/sub       |

---

## Global architecture

All traffic enters through **CloudFront**, which serves as the single entry point for browsers. From there, requests are routed to one of two backends depending on the operation:

- **API Gateway** — handles stateless HTTP requests (both reads and writes) via Lambda functions
- **ALB (Application Load Balancer)** — handles long-lived connections (SSE streams and WebSocket upgrades) via ECS Fargate

**AWS EventBridge** sits between the two bounded contexts as an event bus. When the Editorial context writes data and publishes a domain event, a **Consumer Lambda** is triggered by EventBridge rules. This Lambda materialises the event into the Delivery context's read models (DynamoDB tables and Redis).

### Traffic flow summary

```
Browser
  └─→ CloudFront
        ├─→ S3                          (static assets)
        ├─→ API Gateway
        │     ├─→ Lambda (Editorial)    (POST /articles, POST /updates, POST /blogs/:blogId/close)
        │     └─→ Lambda (Delivery)     (GET /articles, GET /blogs, GET /blogs/:blogId)
        └─→ ALB
              └─→ ECS Fargate           (GET /stream/:blogId, WS /ws/chat/:blogId)
                    ├── Redis Streams    (SSE history + live updates)
                    ├── Redis pub/sub    (WebSocket chat fan-out + close signals)
                    └── DynamoDB         (chat history on connect)
```

### CloudFront responsibilities

CloudFront serves multiple purposes beyond simple CDN caching:

- **Static asset delivery** — serves the Next.js static export from S3 with edge caching
- **API caching** — caches `GET /articles` responses with a 10-second TTL, reducing Lambda invocations during polling spikes
- **SSL termination** — all traffic is HTTPS at the edge; backends communicate over HTTP internally
- **Single domain** — browsers see one origin, avoiding CORS complexity. Path-based routing directs `/api/*` to API Gateway and `/stream/*` + `/ws/*` to ALB
- **WebSocket support** — CloudFront natively proxies WebSocket connections for their full lifetime (upgrade + frames)
- **DDoS protection** — AWS Shield Standard is included; WAF rules can be attached for rate limiting

> **SSE and CloudFront:** SSE connections also route through CloudFront. The `X-Accel-Buffering: no` header and `Cache-Control: no-cache` prevent response buffering. A keepalive comment (`: keepalive`) is sent every 15 seconds to prevent idle connection timeouts.

---

## Bounded contexts

### Editorial Context

The Editorial context is the **source of truth** for all content. It handles write operations exclusively:

- `POST /articles` — publish a news article
- `POST /updates` — post a live blog update
- `POST /blogs/:blogId/close` — close a live blog

Each write operation follows the same pattern:

1. Validate the request body (Zod schema)
2. Persist to the editorial DynamoDB table
3. Publish a domain event to EventBridge

**Editorial DynamoDB tables:**

| Table                      | Partition key | Purpose                  |
| -------------------------- | ------------- | ------------------------ |
| `{env}-editorial-articles` | `articleId`   | Published articles       |
| `{env}-editorial-blogs`    | `blogId`      | Blog metadata and status |
| `{env}-editorial-updates`  | `updateId`    | Live blog updates        |

The Editorial context never reads from Delivery tables and never interacts with Redis. Its only outbound dependency (besides its own DynamoDB) is EventBridge.

### Delivery Context

The Delivery context owns all **read operations** and **real-time streaming**. It maintains optimised read models that are materialised from EventBridge events:

- `GET /articles` — list articles (Lambda, used by polling homepage)
- `GET /blogs` — list blogs (Lambda)
- `GET /blogs/:blogId` — get blog with updates (Lambda)
- `GET /stream/:blogId` — SSE stream for live updates (ECS)
- `WS /ws/chat/:blogId` — WebSocket for live chat (ECS)

**Delivery DynamoDB tables:**

| Table                          | Partition key | GSI                     | Purpose                     |
| ------------------------------ | ------------- | ----------------------- | --------------------------- |
| `{env}-delivery-articles`      | `articleId`   | —                       | Materialised article copies |
| `{env}-delivery-blogs`         | `blogId`      | —                       | Blog metadata with status   |
| `{env}-delivery-updates`       | `updateId`    | `blogId-postedAt-index` | Updates queryable by blog   |
| `{env}-delivery-chat-messages` | `messageId`   | `blogId-postedAt-index` | Chat messages (24h TTL)     |

### Event flow between contexts

Domain events carry **all data needed for materialisation**. The Consumer Lambda never queries Editorial tables — this preserves full autonomy between contexts.

```
Editorial Lambda
  → EventBridge (ArticlePublished | UpdatePosted | BlogClosed)
    → Consumer Lambda
      → DynamoDB (Delivery)     // materialise read model
      → Redis Stream            // SSE: append update for live readers
      → Redis pub/sub           // WebSocket: broadcast close signal
```

**Event types:**

- **`ArticlePublished`** — carries full article data (title, content, slug, author). The Consumer Lambda writes a copy to the delivery articles table.
- **`UpdatePosted`** — carries the full update. The Consumer Lambda writes to the delivery updates table and appends to a Redis Stream (`stream:blog:{blogId}:updates`) for live SSE consumers.
- **`BlogClosed`** — carries blogId and timestamp. The Consumer Lambda updates the delivery blog status and publishes a close signal to Redis pub/sub (`blog:{blogId}:closed`) for WebSocket consumers.

---

## Delivery mechanism deep dives

### Polling (homepage)

The simplest delivery mechanism. The Next.js frontend renders an initial article list via SSR, then polls `GET /articles` every 10 seconds using `setInterval` in a client component.

**Why polling works here:** Article publishing is infrequent (minutes to hours between articles). The 10-second staleness window is acceptable. Polling is simple to implement, cache-friendly (CloudFront absorbs repeated identical requests), and requires no persistent connections.

**Request path:**

1. Browser fetches `GET /articles`
2. CloudFront serves cached response (TTL 60s) or forwards to API Gateway
3. API Gateway invokes the Delivery Lambda
4. Lambda scans the `delivery-articles` table, sorts by `publishedAt` descending
5. Response cached at CloudFront for subsequent requests within the TTL window

### SSE (live blog)

Live blog updates are delivered via Server-Sent Events. When a visitor opens a live blog, the browser establishes a persistent HTTP connection to ECS. Updates appear instantly — no polling delay.

**Why SSE works here:** Updates flow in one direction (server → client). SSE is natively supported by browsers via the `EventSource` API, which handles reconnection automatically. Unlike WebSocket, SSE works over standard HTTP and is simpler to operate behind load balancers.

**Connection lifecycle:**

1. Browser opens `EventSource` to `/stream/:blogId`
2. CloudFront → ALB → ECS routes the connection to a Fargate task
3. ECS sends a `connected` event with `retry: 3000` (reconnection interval)
4. ECS reads the full history from the Redis Stream (`XRANGE`) and replays all existing updates as `update` events, each with an `id:` field set to the stream entry ID
5. ECS enters a blocking read loop (`XREAD BLOCK 2000`) waiting for new entries
6. When the Consumer Lambda appends to the stream (`XADD`), ECS receives the entry and writes it as an SSE `update` event
7. A keepalive comment (`: keepalive`) is sent every 15 seconds to prevent connection timeouts

**Reconnection:** If the connection drops, the browser's `EventSource` automatically reconnects and sends the `Last-Event-ID` header. ECS resumes the stream from that position — no updates are lost.

**Why Redis Streams (not pub/sub) for SSE:**

- **No gap risk** — `XREAD` from a known ID is atomic. With pub/sub, there is a timing window between "query DynamoDB for history" and "subscribe for new messages" where an update could be missed.
- **Built-in replay** — new connections read from `0` (full history); reconnections resume from their last ID. One read path instead of two.
- **Persistence** — stream entries survive Redis restarts (with RDB/AOF). Pub/sub messages are fire-and-forget.

### WebSocket (live chat)

Each live blog has an associated chat where visitors and authors can exchange messages in real time. WebSocket provides the bidirectional communication needed for chat.

**Why WebSocket works here:** Chat requires bidirectional communication — both the client and server send messages at any time. SSE is server-to-client only; polling would introduce unacceptable latency for a chat experience.

**Connection lifecycle:**

1. Browser opens a WebSocket to `/ws/chat/:blogId`
2. CloudFront → ALB → ECS routes the upgrade request
3. ECS validates the blog exists and is active (rejects with close code `4404` or `4410` if not)
4. ECS loads the last 50 chat messages from DynamoDB and sends them as a `history` event
5. ECS subscribes to two Redis pub/sub channels: `chat:{blogId}:messages` and `blog:{blogId}:closed`
6. When a client sends a message, ECS persists it to DynamoDB (with 24h TTL), then publishes to Redis pub/sub
7. All ECS tasks subscribed to the channel receive the message and forward it to their connected WebSocket clients
8. A ping/pong keepalive runs every 30 seconds to detect dead connections

**Blog closure:**
When an editor closes the blog, the `BlogClosed` event flows through EventBridge to the Consumer Lambda, which publishes to the `blog:{blogId}:closed` pub/sub channel. Every ECS task receives this signal, sends a `closed` event to each connected client, and terminates the WebSocket with close code `4410`. The frontend detects this code and disables the chat input without hiding the message history.

**Why Redis pub/sub (not Streams) for chat:**
Chat messages are ephemeral — they expire after 24 hours via DynamoDB TTL. There is no need for the durable, replayable history that Streams provide. Pub/sub is simpler: messages are broadcast instantly to all subscribers and discarded. History is loaded from DynamoDB on connect, which is the right storage layer for persistent-but-expiring data.

---

## Technology choices

### EventBridge vs alternatives

**EventBridge** was chosen as the event bus between bounded contexts. The main alternatives considered:

| Option                       | Strengths                                  | Why not chosen                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SNS + SQS**                | Mature, widely used, simple fan-out        | Requires managing two services (topic + queue per consumer). No built-in schema registry or content-based filtering. For a demo with three event types, EventBridge's rule-based routing is cleaner.                                |
| **Apache Kafka**             | High throughput, durable log, replay       | Massive operational overhead for a demo. Requires cluster management (or MSK, which is expensive). The event volume here is trivial — Kafka's strengths (partitioning, consumer groups, exactly-once) are irrelevant at this scale. |
| **RabbitMQ**                 | Flexible routing, mature, good DLQ support | Another service to operate. Amazon MQ exists but adds cost and complexity. EventBridge is serverless — zero infrastructure to manage.                                                                                               |
| **Direct Lambda invocation** | Simplest possible                          | Tight coupling between contexts. No fan-out, no retry policies, no event archive. Defeats the purpose of demonstrating event-driven architecture.                                                                                   |

**Why EventBridge wins for this use case:**

- **Serverless** — no brokers to manage, no capacity planning
- **Content-based routing** — rules filter on event `DetailType`, routing each event type to the correct consumer
- **Schema registry** — event schemas can be discovered and validated (useful for the demo narrative)
- **Built-in retry and DLQ** — failed deliveries are retried with exponential backoff; dead-letter queues capture poison events
- **Archive and replay** — events can be archived and replayed for debugging or rebuilding read models
- **Pay-per-event** — $1 per million events; effectively free at demo scale

### Redis: Streams vs pub/sub

The system uses **both** Redis data structures, each for a different delivery mechanism:

**Redis Streams** (SSE / live blog updates):

- Durable, append-only log with unique entry IDs
- Supports blocking reads (`XREAD BLOCK`) — ECS tasks wait for new entries without polling
- Supports range reads (`XRANGE`) — replay full history on new connections
- Entry IDs map naturally to SSE `id:` fields, enabling `Last-Event-ID` reconnection
- Entries persist across Redis restarts (with RDB/AOF persistence)

**Redis pub/sub** (WebSocket / chat + close signals):

- Fire-and-forget broadcast to all subscribers
- No persistence — if no subscriber is listening, the message is lost
- Simpler mental model for ephemeral fan-out
- Each subscriber needs a dedicated Redis connection (pub/sub monopolises the connection)

**Why not use Streams for everything?** Streams add complexity (consumer groups, entry trimming, ID management) that chat doesn't need. Chat history is loaded from DynamoDB on connect; Redis pub/sub only handles the real-time broadcast. Using the right tool for each pattern keeps the codebase clear and demonstrates the trade-offs during the presentation.

**Why not use pub/sub for everything?** The SSE use case requires gap-free replay on reconnection. With pub/sub, there is an inherent race condition: between querying DynamoDB for history and subscribing for live messages, an update could be published and lost. Redis Streams eliminate this gap entirely — a single `XREAD` from the last known ID returns both historical and live entries atomically.

### Lambda vs ECS Fargate

| Concern                 | Lambda                                     | ECS Fargate                                       |
| ----------------------- | ------------------------------------------ | ------------------------------------------------- |
| **Connection duration** | 15-minute max; billed per-ms               | Unlimited; billed per-hour                        |
| **Cold starts**         | 100–500ms (acceptable for API calls)       | None (tasks are always running)                   |
| **Scaling**             | Per-invocation, instant                    | Task-based, minutes to scale up                   |
| **SSE/WebSocket**       | Impractical — idle connections burn budget | Natural fit — long-lived connections are the norm |
| **Stateless HTTP**      | Ideal — invoke, respond, done              | Over-provisioned for simple request/response      |

**Decision:** Lambda for all stateless HTTP endpoints (reads and writes). ECS Fargate exclusively for SSE and WebSocket connections that may last minutes to hours.

### DynamoDB

DynamoDB was chosen for all persistence. The alternatives:

- **Aurora Serverless** — relational model is unnecessary; the data is simple key-value with one GSI pattern. Aurora's cold start (30+ seconds for v1, better in v2 but still noticeable) is a poor fit for Lambda.
- **S3** — suitable for blob storage but not for query patterns like "get all updates for blog X sorted by time".
- **ElastiCache (Redis)** — Redis is used for real-time streaming but not as the primary datastore. DynamoDB provides durable, queryable storage with TTL support for chat message expiration.

**Dual-table design:** Editorial and Delivery contexts each have their own DynamoDB tables. This is the CQRS principle applied at the storage layer — write-optimised tables (simple key lookups during writes) and read-optimised tables (GSIs for query patterns like "updates by blogId sorted by postedAt").

### Next.js static export

The frontend is built as a **static export** (`next export`). Pages are pre-rendered at build time and served from S3 via CloudFront. Client-side JavaScript handles polling (`setInterval`) and real-time connections (`EventSource`, `WebSocket`).

**Why not SSR or ISR?** Static export eliminates the need for a Node.js server in production. The homepage polls for fresh data client-side; the live blog and chat hydrate from API calls on mount. There is no per-request server rendering needed — all personalisation happens in the browser.

---

## Local development

Locally, the entire system runs as a single Express server with Docker providing Redis and DynamoDB (via LocalStack):

```yaml
# docker-compose.yml
services:
  redis: redis:7-alpine     (port 6379)
  localstack: localstack/localstack (port 4566, DynamoDB only)
```

The `InProcessPublisher` replaces EventBridge locally. When a domain event is published, it materialises directly into the delivery tables and writes to Redis — simulating the full Consumer Lambda flow without requiring an actual event bus. The application code is unaware of the difference thanks to the `EventPublisher` interface.

```
Production:    EventBridgePublisher → EventBridge → Consumer Lambda → Redis + DynamoDB
Local dev:     InProcessPublisher   →               (inline)        → Redis + DynamoDB
```

This keeps the local dev experience fast (no LocalStack EventBridge, which requires Pro) while maintaining identical application-level behaviour.
