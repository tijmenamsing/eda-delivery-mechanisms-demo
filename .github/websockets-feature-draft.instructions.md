# proposal-chat.md

## Context

The BBTG News demo application is fully implemented with two real-time delivery patterns:

1. **Homepage** — polling (60s interval via Next.js ISR)
2. **Live blog** — SSE (EventSource → ECS Fargate → Redis pub/sub)

We want to add a third demonstration: **WebSockets**, implemented as a live chat feature on the live blog page. Visitors can chat with each other about the match in real time.

This document lays out the architectural options and constraints. **Your task is to review these options, make a recommendation, create a detailed implementation plan, and get approval before writing any code.**

---

## Feature description

A chat panel sits alongside the live blog on `/blog/[blogId]`. Visitors can:

- See the last N messages when they open the page (loaded from persistent storage)
- Visitors must open the chat panel to connect to the WebSocket and receive new messages (to avoid unnecessary connections for users who don't care about the chat)
- Send a chat message
- See new messages from other visitors appear in real time without refreshing

This feature exists to demonstrate WebSockets as a delivery mechanic, in contrast to:

- SSE (live blog updates — unidirectional, server pushes)
- Polling (homepage — client pulls)

The contrast must be clear and explainable to a technical audience.

---

## Constraints

Before evaluating options, note the following hard constraints inherited from the existing project:

- **Local development must work without AWS credentials**
- **TypeScript throughout**
- **No authentication** — consistent with the rest of the demo
- **Messages are semi-ephemeral** — last 50 messages per blog should be retrievable for new joiners. Full message history is not required.
- **Scale assumption** — this is a demo. Assume a small number of concurrent users (< 100). The architecture should be correct and extensible, not necessarily optimised for thousands of concurrent connections.
- **Monorepo conventions apply** — see `fullstack-typescript-developer.agent.md` for full details on naming, testing, environment variable handling, and code style.

---

## Option A — ECS Fargate + Redis pub/sub + `ws` library

### How it works

A dedicated Node.js WebSocket server runs as a separate ECS Fargate service. It uses the `ws` library (lightweight, no client dependency). Redis pub/sub handles fan-out across multiple server nodes — the same pattern used by the existing SSE service. Question: Should we reuse the same api app or create a new one?

**Message flow:**

1. Visitor opens live blog → Visitor opens chat panel → WebSocket connection to chat service via ALB
2. Visitor sends message → arrives at chat service node X
3. Node X publishes to Redis channel `chat:<blogId>`
4. All nodes subscribed to `chat:<blogId>` receive it (including node X)
5. Each node forwards to all locally connected clients
6. DynamoDB stores message for history (last 50 per blog)

**Local development:**

- WebSocket server runs as a plain Node.js process (`apps/chat`)
- Redis already running via docker-compose
- DynamoDB already running via LocalStack
- No additional infrastructure needed

**ALB configuration:**

- WebSocket upgrade supported natively by ALB
- Idle timeout must be increased to 3600s for the chat target group (or implement client-side ping/pong keepalive every 30s — preferred)
- New target group: `/chat/*` → chat service

**New components:**

- `apps/chat/` — standalone Node.js WebSocket server (or do you recommend reusing the existing app?)
- `components/LiveBlogChat.tsx` — client component
- `hooks/useChat.ts` — WebSocket lifecycle management
- New CDK construct: `ChatService` (ECS Fargate + ALB routing)
- New DynamoDB table: `chat-messages`
- New Redis channel pattern: `chat:<blogId>`

### Trade-offs

|     |                                                             |
| --- | ----------------------------------------------------------- |
| ✅  | Works fully locally with existing Docker setup              |
| ✅  | Consistent with SSE service pattern — same Redis decoupling |
| ✅  | Low latency — Redis fan-out is fast                         |
| ✅  | Scales horizontally without coordination overhead           |
| ✅  | `ws` is lightweight — no client-side library needed         |
| ⚠️  | New ECS service to manage in CDK                            |
| ⚠️  | ALB idle timeout configuration required                     |

---

## Option B — API Gateway WebSockets + Lambda

### How it works

AWS API Gateway manages WebSocket connections. Three Lambda functions handle lifecycle:

- `$connect` — store connection ID in DynamoDB
- `$disconnect` — remove connection ID from DynamoDB
- `$default` — receive message, query all connection IDs for the blog, broadcast via API Gateway Management API

**Message flow:**

1. Visitor connects → `$connect` Lambda stores `{ connectionId, blogId }` in DynamoDB
2. Visitor sends message → `$default` Lambda fires
3. Lambda queries DynamoDB for all `connectionId`s in this blog
4. Lambda calls Management API once per connection to broadcast
5. API Gateway pushes message to each connected client

**Local development:**

- No local emulator for API Gateway WebSockets
- Would require either deploying to AWS to test, or building a custom mock server
- This breaks the `pnpm dev` local-first constraint

**Known issues:**

- Fan-out at scale: 100 visitors = 100 Management API calls per message
- Stale connection IDs: `$disconnect` does not always fire reliably — need TTL cleanup and `GoneException` handling
- Higher latency per message: Lambda invocation overhead on every message

### Trade-offs

|     |                                                                    |
| --- | ------------------------------------------------------------------ |
| ✅  | Fully serverless — no ECS service to manage                        |
| ✅  | Scales to zero when no visitors                                    |
| ❌  | No local development emulator — breaks `pnpm dev` constraint       |
| ❌  | Fan-out via DynamoDB connection IDs is slow and expensive at scale |
| ❌  | Stale connection management complexity                             |
| ❌  | Higher per-message latency                                         |

---

## Option C — AppSync WebSocket subscriptions

### How it works

AppSync is AWS's managed GraphQL service with built-in WebSocket subscriptions. Clients subscribe to a GraphQL subscription. When a mutation is published, AppSync broadcasts to all subscribers automatically — no connection ID management needed.

**Message flow:**

1. Visitor opens page → GraphQL subscription over WebSocket
2. Visitor sends message → GraphQL mutation
3. AppSync broadcasts mutation result to all subscribers automatically
4. DynamoDB stores message via direct AppSync resolver (no Lambda needed)

**Local development:**

- No local AppSync emulator
- Amplify mocking tools exist but are limited and not compatible with the existing stack
- Would require deploying to AWS to test — breaks `pnpm dev` constraint

**Known issues:**

- Per-message pricing — busy chat during a football match generates many messages
- AppSync subscriptions are designed for coarse-grained state updates, not high-frequency real-time messaging
- Introduces GraphQL into a REST-based project — inconsistent API layer

### Trade-offs

|     |                                                                         |
| --- | ----------------------------------------------------------------------- |
| ✅  | Managed fan-out — no connection ID management                           |
| ✅  | No custom WebSocket server                                              |
| ✅  | Good fit for low-frequency state sync use cases                         |
| ❌  | No local development emulator — breaks `pnpm dev` constraint            |
| ❌  | Per-message pricing adds up for busy chat                               |
| ❌  | Introduces GraphQL — inconsistent with existing REST API                |
| ❌  | Abstraction mismatch — designed for state sync, not real-time messaging |

---

## Preliminary leaning

Based on the constraints — particularly **local development must work without AWS credentials** — Option A (ECS + Redis + `ws`) appears to be the strongest fit. It is consistent with the existing SSE architecture, works fully locally, and demonstrates WebSockets clearly without introducing new AWS dependencies that cannot be emulated.

Options B and C both break the local development constraint and introduce complexity that outweighs their serverless convenience for this use case.

**However, this is your call to make.** You may identify considerations not covered here.

---

## Your task

1. **Review all three options** in the context of the full codebase (`agent.md`, `instructions.md`, existing implementation)
2. **Make a recommendation** — which option, and why. If you disagree with the preliminary leaning, say so and explain.
3. **Identify anything missing** — are there edge cases, technical constraints, or implementation details not covered in this proposal that affect the decision?
4. **Write a detailed implementation plan** for your recommended option, covering:
   - All new files and their responsibilities
   - Changes to existing files
   - New CDK constructs and stacks
   - New DynamoDB tables and Redis channels
   - Frontend components and hooks
   - Test coverage (Vitest unit tests, Playwright E2E)
   - Local development setup changes (if any)
   - Any open questions that need answers before implementation starts
5. **Present the plan for approval before writing any code**

Do not write implementation code until the plan is approved.
