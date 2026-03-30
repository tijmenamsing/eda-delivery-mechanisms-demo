# WebSocket Chat — Implementation Plan

## 1. Problem statement

The BBTG Nieuws demo demonstrates two event-driven delivery patterns: **polling** (homepage articles, 60s interval) and **SSE** (live blog updates, instant push). We want to add a third: **WebSockets**, implemented as a live chat panel on the blog page. This gives the demo three clearly distinct delivery mechanisms to compare.

## 2. Recommendation: Option A — ECS Fargate + Redis pub/sub + `ws`

**Option A is the right choice.** The reasoning:

- **Local-first**: Works fully with `pnpm dev` using the existing Docker Compose (Redis + LocalStack). Options B and C have no local emulator and break this hard constraint.
- **Architectural consistency**: Mirrors the SSE service pattern (ECS + ALB + Redis fan-out). The audience can compare SSE vs WebSocket at the code level — same infrastructure, different protocol.
- **True WebSocket demo**: Using `ws` with a native `WebSocket` on the client shows the real protocol — bidirectional, full-duplex. SSE-based chat (as the explore agent suggested) would defeat the purpose of demonstrating WebSockets.
- **Cost**: Reuses the existing ECS cluster and ALB; no new services that charge per-message.

### Key design decision: Reuse the existing `apps/api` app, not a new `apps/chat`

Creating a separate `apps/chat` workspace would mean a second Docker image, a second ECS task definition, and a second ALB listener — all for a few hundred lines of WebSocket logic. Instead:

1. **Add the `ws` WebSocket server to `apps/api`** — it attaches to the same HTTP server that Express uses, sharing port 3001.
2. **The existing ECS Fargate service already runs `apps/api`** — it hosts both the SSE `/stream/:blogId` endpoint and the new `/ws/chat/:blogId` WebSocket endpoint.
3. **The authoring Lambda does NOT handle WebSocket connections** — Lambda doesn't support long-lived connections. Chat message _sending_ (POST) is handled by the Lambda, but the WebSocket server runs only on ECS.

This matches how the SSE stream works today: Express runs on ECS for long-lived connections, Lambda handles the CRUD API.

---

## 3. Architecture

### Message flow

```
Browser  ──WebSocket──▶  ALB  ──▶  ECS Fargate (ws server)
   │                                      │
   │  ws.send({ content, author })        │
   │                                      ▼
   │                               Validate + save to DynamoDB
   │                               Publish to Redis chat:{blogId}
   │                                      │
   │                                      ▼
   │                               All ECS nodes subscribed to
   │                               chat:{blogId} receive message
   │                                      │
   │  ◀──────── ws.send(message) ─────────┘
   │         (broadcast to all connected clients)
```

**Differences from SSE flow (for the demo narrative):**

| Aspect                | SSE (Live Blog)                        | WebSocket (Chat)                              |
| --------------------- | -------------------------------------- | --------------------------------------------- |
| Direction             | Unidirectional (server → client)       | Bidirectional (both ways)                      |
| Who initiates message | Journalist posts via API               | Any visitor sends directly via WebSocket       |
| Protocol              | HTTP/1.1 chunked transfer              | WebSocket upgrade (ws://)                      |
| Reconnection          | EventSource auto-reconnects            | Manual reconnect with exponential backoff      |
| Event routing         | EventBridge → Consumer Lambda → Redis  | Direct: WS handler → Redis (no EventBridge)    |
| Client library        | Native `EventSource`                   | Native `WebSocket`                             |

**Why no EventBridge for chat?** Chat messages are high-frequency and low-latency. Going through EventBridge → Consumer Lambda → Redis adds ~200ms per message. Instead, the WS handler on ECS publishes directly to Redis — same as `InProcessPublisher` does locally. This is an intentional architectural difference to discuss in the demo.

### Redis channels

- Existing: `blog:{blogId}:updates` (SSE updates)
- New: `chat:{blogId}:messages` (WebSocket chat)

### DynamoDB

One new table: `{env}-chat-messages`
- **PK**: `messageId` (string, UUID)
- **GSI**: `blogId-postedAt-index` (PK: `blogId`, SK: `postedAt`)
- Used to load last 50 messages for new joiners

No separate "chats" table — each blog implicitly has a chat room (1:1 mapping via `blogId`).

---

## 4. Implementation checklist

### 4.1 `packages/types` — New types and schemas

**`src/models.ts`** — Add:
```ts
ChatMessage { messageId, blogId, author, content, postedAt }
```

**`src/api.ts`** — Add:
```ts
SendChatMessageRequest  { content, author }  // blogId from URL path
SendChatMessageResponse { message: ChatMessage }
GetChatMessagesResponse { messages: ChatMessage[] }
```

**`src/constants.ts`** — Add:
```ts
REDIS_CHANNELS.chatMessages: (blogId: string) => `chat:${blogId}:messages`

WS_EVENTS = {
  MESSAGE: "message",
  HISTORY: "history",
  ERROR: "error",
} as const

WS_CLOSE_CODES = {
  NORMAL: 1000,
  INVALID_PAYLOAD: 4400,
  BLOG_NOT_FOUND: 4404,
  SERVER_ERROR: 4500,
} as const
```

**`src/events.ts`** — No changes. Chat messages do NOT flow through EventBridge. They go directly through Redis on ECS. This is an intentional design difference vs SSE updates.

### 4.2 `apps/api` — WebSocket server + chat routes

#### New files

**`src/ws/chat-handler.ts`** — Core WebSocket handler

Responsibilities:
- Accept WebSocket connections on path `/ws/chat/:blogId`
- Verify blog exists in DynamoDB on connect; close with 4404 if not found
- Create a dedicated Redis subscriber per connection (same pattern as SSE)
- Subscribe to `chat:{blogId}:messages` Redis channel
- On incoming WS message from client:
  1. Parse and validate with Zod (`SendChatMessageRequest`)
  2. Create `ChatMessage` (generate `messageId`, set `postedAt`)
  3. Write to DynamoDB `chat-messages` table
  4. Publish to Redis channel `chat:{blogId}:messages`
- On Redis message: forward to all locally connected WebSocket clients
- Send `history` event on connect with last 50 messages from DynamoDB
- Keepalive: `ws.ping()` every 30s, close if no `pong` within 10s
- On close: unsubscribe Redis, disconnect subscriber, log

**`src/ws/setup.ts`** — WebSocket server bootstrap

Responsibilities:
- Create `WebSocketServer` from `ws` with `noServer: true`
- On HTTP server `upgrade` event:
  - Parse URL path to extract `blogId`
  - Only handle paths matching `/ws/chat/:blogId`
  - Reject other upgrade requests (let Express handle normal HTTP)
  - Call `wss.handleUpgrade()` then `wss.emit('connection')`
- Export a `setupWebSocket(server: http.Server)` function called from `index.ts`

**`src/routes/chat.ts`** — REST endpoint for chat history (Lambda-compatible)

```
GET /chat/:blogId/messages — returns last 50 messages
```

This endpoint serves the initial chat history when the page loads (SSR). It runs on both Lambda (API Gateway) and ECS, just like `/blogs/:blogId`.

#### Modified files

**`src/index.ts`** — After `server.listen()`, call `setupWebSocket(server)` to attach the WS server to the HTTP server. Add WS cleanup to graceful shutdown (close all WS connections, close WSS).

**`src/app.ts`** — Mount `app.use("/chat", createChatRouter())`. No publisher injection needed — the chat router only reads (GET history). WS handler writes directly.

**`src/lib/env.ts`** — Add:
```ts
CHAT_MESSAGES_TABLE: z.string().default("dev-chat-messages")
```

**`src/lib/redis.ts`** — No changes. Already exports `getRedisClient()` (for publishing) and `createSubscriberClient()` (per connection).

**`src/lib/dynamo.ts`** — No changes. Already exports generic `putItem`, `getItem`, `queryItems`.

**`src/lib/events/inprocess.publisher.ts`** — No changes. Chat doesn't use the EventPublisher interface.

**`src/lib/events/eventbridge.publisher.ts`** — No changes.

**`src/lambda.ts`** — No changes. WebSocket connections are ECS-only. The Lambda serves the REST API including `GET /chat/:blogId/messages` via the Express app.

**`Dockerfile`** — No changes. The same Docker image runs on ECS, `ws` is a runtime dependency.

**`package.json`** — Add dependency: `ws` + `@types/ws` (devDependency).

### 4.3 `apps/web` — Chat UI

#### New files

**`hooks/useChat.ts`** — WebSocket lifecycle hook

```ts
interface UseChatOptions {
  blogId: string
  enabled: boolean  // only connect when chat panel is open
}

interface UseChatResult {
  messages: ChatMessage[]
  isConnected: boolean
  error: string | null
  sendMessage: (content: string, author: string) => void
}
```

Implementation:
- Only establish WS connection when `enabled === true`
- On open: receive `history` event with last 50 messages
- On `message` event: append to messages state
- `sendMessage`: call `ws.send(JSON.stringify({ content, author }))` — bidirectional!
- On close/error: set `isConnected = false`, implement reconnect with exponential backoff (1s, 2s, 4s, max 30s)
- Cleanup: close WS on unmount or when `enabled` flips to false
- URL: `getWSUrl(blogId)` → `ws://localhost:3001/ws/chat/{blogId}` locally, `ws://<ALB>/ws/chat/{blogId}` in production

**`components/ChatPanel.tsx`** — Client component

- Collapsed by default (button: "💬 Chat openen")
- When expanded:
  - Shows connection indicator (green/orange dot, same pattern as LiveBlog)
  - Message list scrolling to bottom on new messages
  - Input field for nickname (persisted in localStorage)
  - Input field for message + send button (Enter to send)
  - Messages show: author, content, timestamp
- When collapsed: disconnects WebSocket (saves resources)

#### Modified files

**`app/blog/[blogId]/page.tsx`** — Add `<ChatPanel blogId={blogId} />` below the `<LiveBlog>` component. No server-side data fetching for chat — history is loaded via WebSocket `history` event on connect.

**`lib/api.ts`** — Add:
```ts
export function getWSUrl(blogId: string): string {
  // NEXT_PUBLIC_SSE_URL points to the ALB (same host that serves SSE)
  const base = process.env["NEXT_PUBLIC_SSE_URL"] ?? "http://localhost:3001";
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/ws/chat/${blogId}`;
}
```

**`components/LiveBlog.tsx`** — No changes. Chat is a sibling component, not nested in LiveBlog.

### 4.4 Infrastructure — CDK changes

#### `infra/lib/stacks/data-stack.ts`

Add new DynamoDB table:

```ts
const chatMessagesTable = new dynamodb.Table(this, "ChatMessagesTable", {
  tableName: `${props.environment}-chat-messages`,
  partitionKey: { name: "messageId", type: STRING },
  billingMode: PAY_PER_REQUEST,
  removalPolicy,
});

chatMessagesTable.addGlobalSecondaryIndex({
  indexName: "blogId-postedAt-index",
  partitionKey: { name: "blogId", type: STRING },
  sortKey: { name: "postedAt", type: STRING },
  projectionType: ALL,
});
```

Export `chatMessagesTable` as a public property.

#### `infra/lib/stacks/api-stack.ts`

- Accept `chatMessagesTable` in props
- Pass it to `SseService` and `AuthoringFunction` constructs
- Add API Gateway route: `GET /chat/{blogId}/messages`

#### `infra/lib/constructs/sse-service.ts`

- Accept `chatMessagesTable` in props
- Add `CHAT_MESSAGES_TABLE` env var to the container
- Grant `chatMessagesTable.grantReadWriteData(taskDef.taskRole)`
- **ALB idle timeout**: Keep at 300s (WebSocket keepalive ping every 30s keeps connections alive within this threshold)

#### `infra/lib/constructs/authoring-function.ts`

- Accept `chatMessagesTable` in props
- Add `CHAT_MESSAGES_TABLE` env var to the Lambda
- Grant `chatMessagesTable.grantReadData(fn)` (Lambda only needs read for GET history)

#### `infra/bin/bbtg-news.ts`

- Pass `dataStack.chatMessagesTable` to `ApiStack`

#### `infra/lib/stacks/frontend-stack.ts`

- Add CloudFront behavior for `/chat/*` → API Gateway origin (for the REST history endpoint, caching disabled)

### 4.5 Local development — Scripts

#### `scripts/init-local.ts`

Add table creation for `dev-chat-messages`:

```ts
await createTable(
  "dev-chat-messages",
  [{ AttributeName: "messageId", KeyType: "HASH" }],
  [
    { AttributeName: "messageId", AttributeType: "S" },
    { AttributeName: "blogId", AttributeType: "S" },
    { AttributeName: "postedAt", AttributeType: "S" },
  ],
  [{
    IndexName: "blogId-postedAt-index",
    KeySchema: [
      { AttributeName: "blogId", KeyType: "HASH" },
      { AttributeName: "postedAt", KeyType: "RANGE" },
    ],
    Projection: { ProjectionType: "ALL" },
  }],
);
```

#### `scripts/seed.ts`

Add a few seed chat messages for the Kennisfestival blog to demonstrate the feature without needing to type manually during the demo.

#### `.env.example` (root)

Add: `CHAT_MESSAGES_TABLE=dev-chat-messages`

#### `apps/api/.env.example`

Add: `CHAT_MESSAGES_TABLE=dev-chat-messages`

#### `docker-compose.yml`

No changes — Redis and LocalStack already running.

### 4.6 Tests

#### `apps/api/test/chat.test.ts` — Vitest + Supertest

- `GET /chat/:blogId/messages` returns last 50 messages sorted by postedAt ascending
- `GET /chat/:blogId/messages` returns empty array when no messages exist

#### `apps/api/test/ws-chat.test.ts` — Vitest + `ws` client

- WebSocket connection opens and receives `history` event
- Sending a valid message broadcasts it back to all connected clients
- Sending an invalid message returns error frame (no crash)
- Connection closes when blog doesn't exist (4404 close code)
- Subscriber client is disconnected on WebSocket close
- Ping/pong keepalive works

#### `packages/types/test/models.test.ts` — Extend

- `ChatMessage` schema validation tests

### 4.7 `scripts/deploy-web.ts`

No changes needed — `NEXT_PUBLIC_SSE_URL` already points to the ALB, and the WS URL is derived from it client-side by replacing `http://` with `ws://`.

---

## 5. File summary

### New files (14)

| File | Purpose |
|------|---------|
| `apps/api/src/ws/chat-handler.ts` | WebSocket connection handler per blogId |
| `apps/api/src/ws/setup.ts` | Attach ws.Server to http.Server |
| `apps/api/src/routes/chat.ts` | GET /chat/:blogId/messages REST endpoint |
| `apps/api/test/chat.test.ts` | REST endpoint tests |
| `apps/api/test/ws-chat.test.ts` | WebSocket handler tests |
| `apps/web/hooks/useChat.ts` | WebSocket lifecycle React hook |
| `apps/web/components/ChatPanel.tsx` | Collapsible chat panel UI |

### Modified files (14)

| File | Change |
|------|--------|
| `packages/types/src/models.ts` | Add ChatMessage schema |
| `packages/types/src/api.ts` | Add chat request/response types |
| `packages/types/src/constants.ts` | Add REDIS_CHANNELS.chatMessages, WS_EVENTS, WS_CLOSE_CODES |
| `apps/api/src/index.ts` | Call setupWebSocket(server), WS cleanup on shutdown |
| `apps/api/src/app.ts` | Mount /chat router |
| `apps/api/src/lib/env.ts` | Add CHAT_MESSAGES_TABLE |
| `apps/api/package.json` | Add ws, @types/ws |
| `apps/web/app/blog/[blogId]/page.tsx` | Add ChatPanel component |
| `apps/web/lib/api.ts` | Add getWSUrl() |
| `infra/lib/stacks/data-stack.ts` | Add chat-messages DynamoDB table |
| `infra/lib/stacks/api-stack.ts` | Wire chatMessagesTable, add /chat route |
| `infra/lib/constructs/sse-service.ts` | Add CHAT_MESSAGES_TABLE env var, grant table access |
| `infra/lib/constructs/authoring-function.ts` | Add CHAT_MESSAGES_TABLE env var, grant read access |
| `infra/bin/bbtg-news.ts` | Pass chatMessagesTable to ApiStack |
| `infra/lib/stacks/frontend-stack.ts` | Add /chat/* CloudFront behavior |
| `scripts/init-local.ts` | Add dev-chat-messages table creation |
| `scripts/seed.ts` | Add seed chat messages |
| `.env.example` | Add CHAT_MESSAGES_TABLE |
| `apps/api/.env.example` | Add CHAT_MESSAGES_TABLE |

---

## 6. Design decisions (resolved)

1. **Message retention**: DynamoDB TTL of 24 hours. Keeps storage clean, consistent with the demo's ephemeral nature. Only the last 50 messages are _displayed_ on connect.

2. **Nickname**: Random default per tab (e.g., "Bezoeker-7x3k"), editable but NOT persisted in localStorage. This allows multiple browser windows to use different nicknames — essential for demoing multi-user chat from a single machine.

3. **Rate limiting**: Client-side debounce (500ms between sends) + server-side max 1 message/second per connection. Simple, no external dependencies.

4. **Message length**: Max 500 characters, validated with Zod on both client and server.

---

## 7. Architectural discussion

### Should WebSocket and SSE share the same ECS container?

**Yes, for this demo. Here's why:**

The concern is valid in theory: SSE and WebSocket connections have different lifecycle patterns and you don't want chat traffic degrading live blog delivery. But it doesn't apply here:

- **Both are I/O-bound, not CPU-bound.** The hot path is: receive from Redis → write to socket. That's microseconds of CPU per message. Node.js handles thousands of concurrent I/O-bound connections on a single event loop without contention.
- **The process already mixes workloads.** The ECS service handles HTTP health checks, REST API requests, AND long-lived SSE streams today. Adding WebSocket connections is the same pattern.
- **Scale assumption is < 100 users.** At this level, even a single-core 256 CPU Fargate task has orders of magnitude more capacity than needed.
- **A second ECS service doubles operational cost for zero practical benefit**: second ALB (or path-based routing on the same ALB), second task definition, second Docker image build, more CDK complexity, ~$35/month extra at minimum.

**When would separation be warranted?** If this were a production system with thousands of concurrent connections and chat traffic measured in hundreds of messages per second, you'd want separate ECS services (or separate task definitions on the same cluster) so you can scale and deploy them independently. The demo architecture is _correct and extensible_ — splitting is a scaling decision, not an architectural one.

### Would API Gateway WebSockets or AppSync be better if local dev wasn't important?

**Still no.** Even without the local dev constraint, Option A is the better choice for this demo for a different reason: **the demo's purpose is to show _how WebSockets work_.**

API Gateway WebSockets abstract the protocol away behind Lambda handlers (`$connect`, `$disconnect`, `$default`). You never see the upgrade handshake, ping/pong frames, or bidirectional message flow. The audience sees Lambda functions, not WebSockets. AppSync abstracts even further — it's GraphQL subscriptions, not WebSockets.

With `ws` on ECS, the code is transparent: `wss.on('connection')`, `ws.on('message')`, `ws.send()`. The audience sees exactly what happens at the protocol level. That's the point of the demo.

That said, if the goal were "add chat to a production app" (not a demo), API Gateway WebSockets would be a legitimate choice because it scales to zero, requires no ECS management, and handles connection lifecycle automatically. The trade-off is latency (~200ms per Lambda invocation), fan-out cost (O(n) Management API calls), and stale connection cleanup complexity.

### Why not use EventBridge for chat? Doesn't the same argument apply?

**This is the most interesting question.** Let me lay out why EventBridge exists for blog updates, and why chat is architecturally different.

**Why blog updates use EventBridge:**

The blog update write path (journalist posts via Lambda) and the broadcast path (ECS pushes via SSE) run in **different compute environments**. The authoring Lambda can't practically publish to Redis directly — it would need VPC access, a Redis connection, and awareness of the channel naming scheme. EventBridge decouples them:

```
Lambda (write) → EventBridge → Consumer Lambda → Redis → ECS (SSE broadcast)
```

EventBridge acts as a bridge between two separate systems. It also enables fan-out to other consumers (analytics, notifications) without modifying the writer.

**Why chat skips EventBridge:**

For WebSocket chat, the write path and broadcast path are in the **same compute environment** (ECS). The WebSocket handler that receives the message can publish directly to Redis:

```
ECS (WS receive) → Redis → ECS (WS broadcast)
```

There's no cross-environment gap to bridge. Adding EventBridge would mean:

```
ECS (WS receive) → EventBridge → Consumer Lambda → Redis → ECS (WS broadcast)
```

This adds ~200-500ms latency per message (Lambda cold/warm start + EventBridge delivery). For chat, that's noticeable and defeats the low-latency promise of WebSockets.

**What we lose by skipping EventBridge:**

- **No event bus tap-in**: Other services (analytics, moderation) can't subscribe to chat events without modifying the WS handler.
- **No EventBridge event log**: No built-in audit trail (though we store messages in DynamoDB).
- **Inconsistency**: Blog updates flow through the event backbone; chat doesn't.

**What we gain by skipping EventBridge:**

- **Low latency**: ~5ms (Redis pub/sub) vs ~200-500ms (EventBridge + Lambda).
- **A demo talking point**: "WebSockets enable the server to both receive AND broadcast — no event bus intermediary needed. This is the architectural advantage of bidirectional protocols."
- **Simplicity**: No additional Lambda handler, no additional EventBridge rule.

**Verdict:** The difference is intentional and architecturally sound. It reflects a real design choice: use an event bus when the writer and reader are in different systems; use direct pub/sub when they're co-located. This contrast _adds_ to the demo narrative rather than detracting from it.

---

## 7. Implementation order

1. `packages/types` — models, API types, constants
2. `apps/api` — REST chat endpoint + WebSocket handler + tests
3. `apps/web` — ChatPanel + useChat hook
4. Local validation — `pnpm setup && pnpm dev`, test chat end-to-end
5. `infra/` — CDK changes (DynamoDB table, ECS env vars, CloudFront behavior)
6. `scripts/` — init-local, seed, .env files
7. Deploy — `pnpm run deploy`, verify on CloudFront
