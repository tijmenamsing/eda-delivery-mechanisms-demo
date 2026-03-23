# instructions.md

## Before you start

Read `fullstack-typescript-developer.agent.md` completely before writing any code. All architectural decisions, conventions, and constraints are defined there. Do not deviate without flagging it explicitly.

Generate complete, working code for every file. No placeholders, no `// TODO`, no `// implement this`. Every module gets a corresponding test file.

---

## Overview

Build the NewsWire demo application — a digital news platform demonstrating real-time delivery patterns in an event-driven architecture.

**Two flows to implement:**

1. **Homepage** — displays a list of articles, refreshed via client-side polling every 60 seconds
2. **Live blog** — displays real-time football match updates via Server-Sent Events

**Demo scenario:** A football match between Ajax and PSV. The journalist UI allows posting articles (visible on homepage after next poll) and live match updates (visible on live blog immediately via SSE). This contrast is the core of the demo.

---

## Step 1 — Monorepo scaffold

Create the following structure. Every file listed must be created.

```
newswire/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   └── types/
├── infra/
├── docs/
├── scripts/
├── docker-compose.yml
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── turbo.json
└── vitest.workspace.ts
```

### `package.json` (root)

- `"name": "newswire"`
- `"private": true`
- Scripts:
  - `"dev"`: `turbo run dev --parallel`
  - `"build"`: `turbo run build`
  - `"test"`: `turbo run test`
  - `"test:e2e"`: `turbo run test:e2e`
  - `"lint"`: `turbo run lint`
  - `"infra:up"`: `docker-compose up -d`
  - `"infra:down"`: `docker-compose down`
  - `"db:init"`: `tsx scripts/init-local.ts`
  - `"db:seed"`: `tsx scripts/seed.ts`
  - `"setup"`: `pnpm infra:up && sleep 3 && pnpm db:init && pnpm db:seed`
- devDependencies: `turbo`, `tsx`, `typescript`, `vitest`

### `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "infra"
```

### `tsconfig.base.json`

Strict TypeScript config:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### `turbo.json`

Define pipeline:

- `build` — depends on `^build`, outputs `dist/**`, `.next/**`
- `dev` — persistent, depends on `^build`
- `test` — depends on `^build`
- `test:e2e` — depends on `build`
- `lint` — no dependencies

### `docker-compose.yml`

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  localstack:
    image: localstack/localstack
    ports:
      - "4566:4566"
    environment:
      - SERVICES=dynamodb
      - DEFAULT_REGION=eu-west-1
      - EAGER_SERVICE_LOADING=1
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4566/_localstack/health"]
      interval: 5s
      timeout: 3s
      retries: 10
```

### `vitest.workspace.ts`

Configure Vitest workspace that includes `apps/api` and `packages/types`.

### `.env.example` (root)

```
# Environment
NODE_ENV=development

# AWS (local)
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
DYNAMODB_ENDPOINT=http://localhost:4566

# Redis
REDIS_URL=redis://localhost:6379

# API
API_URL=http://localhost:3001

# DynamoDB table names
ARTICLES_TABLE=dev-articles
BLOGS_TABLE=dev-blogs
UPDATES_TABLE=dev-updates

# Event publishing
EVENT_PUBLISHER=inprocess
```

---

## Step 2 — `packages/types`

**Package name:** `@newswire/types`

### `src/constants.ts`

```typescript
export const REDIS_CHANNELS = {
  blogUpdates: (blogId: string) => `blog:${blogId}:updates`,
} as const;

// Table names are NOT defined here — they come from each app's env.ts.
// This keeps packages/types pure (no process.env side effects at import time).

export const SSE_EVENTS = {
  UPDATE: "update",
  CONNECTED: "connected",
  DONE: "done",
  ERROR: "error",
} as const;
```

### `src/models.ts`

Define the following types with Zod schemas and inferred TypeScript types:

**Article:**

- `articleId: string`
- `title: string`
- `content: string`
- `author: string`
- `publishedAt: string` (ISO 8601)
- `slug: string`

**Blog:**

- `blogId: string`
- `title: string`
- `matchHomeTeam: string`
- `matchAwayTeam: string`
- `matchDate: string`
- `status: 'active' | 'closed'`
- `createdAt: string`

**BlogUpdate:**

- `updateId: string`
- `blogId: string`
- `content: string`
- `author: string`
- `minute: number | null` (match minute, null for non-match events)
- `type: 'goal' | 'card' | 'substitution' | 'commentary' | 'halftime' | 'fulltime'`
- `postedAt: string` (ISO 8601)

### `src/events.ts`

Define EventBridge event shapes:

**ArticlePublishedEvent:**

- `type: 'ArticlePublished'`
- `articleId: string`
- `title: string`
- `author: string`
- `publishedAt: string`

**UpdatePostedEvent:**

- `type: 'UpdatePosted'`
- `updateId: string`
- `blogId: string`
- `content: string`
- `author: string`
- `minute: number | null`
- `updateType: BlogUpdate['type']`
- `postedAt: string`

### `src/api.ts`

Request/response types for all API endpoints. Define with Zod:

**POST /articles request:** `{ title, content, author }`
**POST /articles response:** `{ article: Article }` (status 201)
**GET /articles response:** `{ articles: Article[] }`
**POST /updates request:** `{ blogId, content, author, minute, type }`
**POST /updates response:** `{ update: BlogUpdate }` (status 201)
**GET /blogs response:** `{ blogs: Blog[] }`
**GET /blogs/:blogId response:** `{ blog: Blog, updates: BlogUpdate[] }` (404 with `{ error: { code, message } }` if blog not found)

**Error responses** follow a standard envelope:

```ts
{ "error": { "code": string, "message": string } }
```

Use `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `INTERNAL_ERROR` (500). Never leak stack traces.

Export all schemas and inferred types. No barrel files — import from the specific file.

---

## Step 3 — `apps/api`

**Package name:** `@newswire/api`

### Structure

```
apps/api/
├── src/
│   ├── lib/
│   │   ├── env.ts
│   │   ├── dynamo.ts
│   │   ├── redis.ts
│   │   └── events/
│   │       ├── publisher.interface.ts
│   │       ├── inprocess.publisher.ts
│   │       └── eventbridge.publisher.ts
│   ├── routes/
│   │   ├── articles.ts
│   │   ├── updates.ts
│   │   ├── blogs.ts
│   │   └── stream.ts
│   ├── middleware/
│   │   ├── error.ts
│   │   └── validate.ts
│   └── index.ts
├── test/
│   ├── articles.test.ts
│   ├── updates.test.ts
│   ├── blogs.test.ts
│   └── stream.test.ts
├── .env.example
├── package.json
└── tsconfig.json
```

### `src/lib/env.ts`

Validate all required environment variables at startup using Zod. Export a typed `env` object. The app must crash immediately with a clear error message if any required variable is missing. Never access `process.env` directly outside this file.

Required variables:

- `NODE_ENV`
- `PORT` (default: `3001`)
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `DYNAMODB_ENDPOINT` (optional — only in local dev)
- `REDIS_URL`
- `ARTICLES_TABLE`
- `BLOGS_TABLE`
- `UPDATES_TABLE`
- `ALLOWED_ORIGIN` (optional — CORS origin, defaults to `http://localhost:3000`)
- `EVENT_PUBLISHER` (`'inprocess' | 'eventbridge'`, default: `'inprocess'`)
- `EVENTBRIDGE_BUS_NAME` (required when `EVENT_PUBLISHER=eventbridge`)

### `src/lib/dynamo.ts`

Export a configured DynamoDB DocumentClient. When `DYNAMODB_ENDPOINT` is set, use it as the endpoint (LocalStack). Otherwise use default AWS endpoint resolution.

Export typed helper functions:

- `putItem<T>(tableName: string, item: T): Promise<void>`
- `getItem<T>(tableName: string, key: Record<string, string>): Promise<T | null>`
- `queryItems<T>(tableName: string, keyCondition: string, values: Record<string, unknown>): Promise<T[]>`
- `scanItems<T>(tableName: string): Promise<T[]>`

### `src/lib/redis.ts`

Export two functions:

- `getRedisClient(): Redis` — returns a shared ioredis client for publishing
- `createSubscriberClient(): Redis` — creates a **new** ioredis connection for subscribing

**Important:** Never use the shared client for pub/sub subscriptions. Each SSE connection must create its own subscriber client via `createSubscriberClient()` and disconnect it when the SSE connection closes.

### `src/lib/events/publisher.interface.ts`

```typescript
import type { ArticlePublishedEvent, UpdatePostedEvent } from "@newswire/types";

export type DomainEvent = ArticlePublishedEvent | UpdatePostedEvent;

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
```

### `src/lib/events/inprocess.publisher.ts`

Implements `EventPublisher`. When an `UpdatePosted` event is received, publish it directly to the Redis channel `blog:<blogId>:updates` using `getRedisClient()`. When an `ArticlePublished` event is received, log it (no further action needed locally).

### `src/lib/events/eventbridge.publisher.ts`

Implements `EventPublisher`. Publishes events to AWS EventBridge using the AWS SDK v3 `@aws-sdk/client-eventbridge`. Use `env.EVENTBRIDGE_BUS_NAME` as the event bus name. Set `Source` to `newswire.api` and `DetailType` to the event type.

### `src/middleware/validate.ts`

Generic Express middleware factory that validates `req.body` against a Zod schema. Returns `400` with validation errors if invalid.

```typescript
export function validate<T>(schema: ZodSchema<T>): RequestHandler;
```

### `src/middleware/error.ts`

Express error handler middleware. Logs the error, returns appropriate HTTP status. Handle `ZodError` as 400, unknown errors as 500. Never leak stack traces in production.

### `src/routes/articles.ts`

Express router for `/articles`:

**`GET /articles`**

- Scan the articles DynamoDB table
- Return `{ articles: Article[] }` sorted by `publishedAt` descending
- No caching headers — CloudFront handles caching in production

**`POST /articles`**

- Validate body with `PostArticleRequestSchema` from `@newswire/types`
- Generate `articleId` with `crypto.randomUUID()`
- Generate `slug` from title (lowercase, hyphens)
- Set `publishedAt` to current ISO timestamp
- Write to DynamoDB
- Publish `ArticlePublishedEvent` via injected `EventPublisher`
- Return `{ article: Article }` with status 201

### `src/routes/updates.ts`

Express router for `/updates`:

**`POST /updates`**

- Validate body with `PostUpdateRequestSchema` from `@newswire/types`
- Verify the blog exists by fetching it from the blogs table — return 404 if not found
- Generate `updateId` with `crypto.randomUUID()`
- Set `postedAt` to current ISO timestamp
- Write to DynamoDB updates table
- Publish `UpdatePostedEvent` via injected `EventPublisher`
- Return `{ update: BlogUpdate }` with status 201

### `src/routes/blogs.ts`

Express router for `/blogs`:

**`GET /blogs`**

- Scan blogs table
- Return `{ blogs: Blog[] }`

**`GET /blogs/:blogId`**

- Get blog by `blogId`
- Query updates table for all updates with this `blogId`, sorted by `postedAt` ascending
- Return `{ blog: Blog, updates: BlogUpdate[] }`
- Return 404 if blog not found

### `src/routes/stream.ts`

Express router for `/stream/:blogId`. This is the SSE endpoint.

**`GET /stream/:blogId`**

1. Set SSE headers:

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

2. Call `res.flushHeaders()` immediately

3. Send a `connected` event to confirm the stream is open:

```
event: connected
data: {"blogId": "<blogId>"}

```

4. Create a dedicated subscriber via `createSubscriberClient()`

5. Subscribe to `blog:<blogId>:updates` channel

6. On each Redis message, parse the JSON payload and write to the response:

```
event: update
data: <json payload>

```

Note the double newline — it is required by the SSE spec.

7. Set up a keepalive interval (every 30 seconds) that sends a comment line:

```
: keepalive

```

This prevents ALB and proxies from closing idle connections.

8. On `req.on('close')`:
   - Clear the keepalive interval
   - Unsubscribe from Redis channel
   - Disconnect the subscriber client
   - End the response

**Do not use `try/catch` to swallow errors silently.** Log errors and close the stream gracefully.

### `src/index.ts`

Express app entry point:

- Configure CORS — allow `http://localhost:3000` in development, configurable via `ALLOWED_ORIGIN` env var
- Parse JSON bodies
- Mount routers: `/articles`, `/updates`, `/blogs`, `/stream`
- Mount error middleware last
- Instantiate the correct `EventPublisher` based on `env.EVENT_PUBLISHER`
- Inject the publisher into routes (do not use a global singleton — use dependency injection via router factory functions)
- Listen on `env.PORT`
- Log startup info including which event publisher is active
- Handle `SIGTERM` and `SIGINT` for graceful shutdown: stop accepting new connections, drain existing SSE streams, disconnect Redis clients, then exit

### Tests (`test/`)

Use Vitest + Supertest for all API tests. Mock DynamoDB and Redis using `vi.mock`. Test:

**`articles.test.ts`:**

- `GET /articles` returns sorted articles
- `POST /articles` creates article, calls publisher, returns 201
- `POST /articles` with invalid body returns 400

**`updates.test.ts`:**

- `POST /updates` creates update, calls publisher, returns 201
- `POST /updates` with invalid body returns 400
- `POST /updates` with unknown blogId returns 404

**`blogs.test.ts`:**

- `GET /blogs` returns all blogs
- `GET /blogs/:blogId` returns blog with updates sorted by `postedAt`
- `GET /blogs/:blogId` with unknown blogId returns 404

**`stream.test.ts`:**

- `GET /stream/:blogId` sets correct SSE headers
- `GET /stream/:blogId` sends `connected` event on open
- Redis message is forwarded as SSE `update` event
- Subscriber client is disconnected on request close

---

## Step 4 — `apps/web`

**Package name:** `@newswire/web`

### Structure

```
apps/web/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Homepage
│   ├── blog/
│   │   └── [blogId]/
│   │       └── page.tsx            # Live blog (reader view)
│   └── journalist/
│       └── page.tsx                # Journalist UI
├── components/
│   ├── ArticleList.tsx
│   ├── ArticleCard.tsx
│   ├── LiveBlog.tsx
│   ├── LiveBlogUpdate.tsx
│   ├── JournalistPanel.tsx
│   ├── PublishArticleForm.tsx
│   └── PostUpdateForm.tsx
├── hooks/
│   └── useLiveBlog.ts
├── lib/
│   └── api.ts
├── .env.example
├── package.json
├── next.config.ts
└── tsconfig.json
```

### `app/layout.tsx`

Root layout. Dark background (`#0f1115`). Import `Syne` and `JetBrains Mono` from `next/font/google`. Apply globally.

### `app/page.tsx` — Homepage

Server Component. Fetches articles on the server with `fetch()` using `{ next: { revalidate: 60 } }` — this is Next.js's built-in polling via ISR. Display the `ArticleList` component with the fetched articles.

Include a visible indicator showing when the page was last updated (server render timestamp). This makes the polling behaviour tangible during the demo.

Fetch from `process.env.API_URL + '/articles'`.

### `app/blog/[blogId]/page.tsx` — Live blog reader

Split into:

- Server Component (`page.tsx`) — fetches initial blog data and updates from the API, passes to the client component
- Client Component (`LiveBlog.tsx`) — renders the live blog and connects the SSE stream

The page must be functional without JavaScript (initial updates visible from SSR). SSE enriches the experience progressively.

### `app/journalist/page.tsx` — Journalist UI

Client Component. Two tabs or sections:

1. **Artikel publiceren** — `PublishArticleForm`
2. **Live update posten** — `PostUpdateForm`

Simple, functional design. No authentication needed.

### `components/ArticleList.tsx`

Renders a list of `ArticleCard` components. Shows "Laatste update: <timestamp>" above the list to make polling visible.

### `components/ArticleCard.tsx`

Displays article title, author, published timestamp. Links to article (static, not implemented). Clean card design using Tailwind.

### `components/LiveBlog.tsx`

**Client Component** (`"use client"`).

Props: `initialUpdates: BlogUpdate[]`, `blog: Blog`, `blogId: string`

- Renders the match header (Ajax vs PSV, score if available)
- Renders list of `LiveBlogUpdate` components
- New updates prepended to the top (most recent first)
- Uses `useLiveBlog` hook for SSE connection
- Shows a "LIVE" badge when SSE is connected
- Shows a "Verbinding verbroken — opnieuw verbinden..." message when disconnected
- Smooth scroll or visual highlight on new update arrival

### `components/LiveBlogUpdate.tsx`

Renders a single blog update. Style based on `type`:

- `goal` — highlighted, prominent, show minute
- `card` — red/yellow accent
- `halftime` / `fulltime` — centered, prominent
- `commentary` — standard
- Show `minute` as a badge (e.g. "34'") when not null

### `components/PublishArticleForm.tsx`

Client Component. Form fields:

- Title (text input)
- Content (textarea)
- Author (text input, pre-filled with "Redactie")

On submit: `POST` to `API_URL/articles`. Show success message with article title on success. Show error message on failure. Reset form on success.

### `components/PostUpdateForm.tsx`

Client Component. Form fields:

- Blog selector (dropdown, fetched from `GET /blogs`, shows active blogs only)
- Update type (select: commentary, goal, card, substitution, halftime, fulltime)
- Match minute (number input, optional — disabled for halftime/fulltime)
- Content (textarea)
- Author (text input, pre-filled with "Verslaggever")

On submit: `POST` to `API_URL/updates`. Show success message on success. Reset content field on success (keep other fields).

### `hooks/useLiveBlog.ts`

Custom React hook for SSE connection management.

```typescript
function useLiveBlog(
  blogId: string,
  initialUpdates: BlogUpdate[],
): {
  updates: BlogUpdate[];
  connected: boolean;
};
```

Implementation:

- Open `EventSource` on `API_URL/stream/<blogId>`
- Listen for `connected` event — set `connected: true`
- Listen for `update` event — parse JSON, prepend to updates array
- Listen for `error` event — set `connected: false`, implement exponential backoff reconnection (start at 1s, max 30s)
- Clean up `EventSource` and reconnect timer in `useEffect` return function
- Never leak event listeners

### `lib/api.ts`

Typed API client functions. Use `fetch` with proper error handling. Throw typed errors on non-2xx responses.

```typescript
export async function getArticles(): Promise<Article[]>;
export async function publishArticle(
  data: PostArticleRequest,
): Promise<Article>;
export async function getBlogs(): Promise<Blog[]>;
export async function getBlog(
  blogId: string,
): Promise<{ blog: Blog; updates: BlogUpdate[] }>;
export async function postUpdate(data: PostUpdateRequest): Promise<BlogUpdate>;
```

### `next.config.ts`

Configure `rewrites` to proxy `/api/*` to `API_URL` in development. This avoids CORS issues in the browser:

```typescript
async rewrites() {
  return [
    {
      source: '/api/:path*',
      destination: `${process.env.API_URL}/:path*`,
    },
  ]
}
```

### `.env.example`

```
API_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## Step 5 — Scripts

### `scripts/init-local.ts`

Creates DynamoDB tables in LocalStack. Run after `docker-compose up`.

Create three tables:

**`dev-articles`**

- Partition key: `articleId` (String)
- No sort key

**`dev-blogs`**

- Partition key: `blogId` (String)
- No sort key

**`dev-updates`**

- Partition key: `blogId` (String)
- Sort key: `postedAt` (String)
- This enables efficient queries for all updates of a blog, sorted by time

Use `CreateTableCommand` from `@aws-sdk/client-dynamodb`. If table already exists (`ResourceInUseException`), skip silently.

Log clearly which tables were created or already existed.

### `scripts/seed.ts`

Seeds realistic football match content. Run after `init-local.ts`.

**Seed one blog:**

```
blogId: "ajax-psv-2025"
title: "Ajax - PSV | Eredivisie"
matchHomeTeam: "Ajax"
matchAwayTeam: "PSV"
matchDate: <today's date>
status: "active"
```

**Seed at least 8 blog updates in chronological order:**

1. type: `commentary`, minute: 1 — "Aftrap! Ajax speelt in witte shirts, PSV in rood-wit."
2. type: `commentary`, minute: 12 — "Eerste grote kans voor Ajax. Brobbey schiet over."
3. type: `goal`, minute: 23 — "DOELPUNT AJAX! Bergwijn scoort na een prachtige voorzet van Wijndal. 1-0."
4. type: `card`, minute: 31 — "Gele kaart voor De Jong (PSV) na een overtreding op Fitz-Jim."
5. type: `halftime`, minute: 45 — "Rust. Ajax leidt met 1-0. PSV zoekt naar antwoord na de pauze."
6. type: `commentary`, minute: 47 — "PSV begint sterk aan de tweede helft. Bakayoko dwingt Pasveer tot een redding."
7. type: `goal`, minute: 58 — "GELIJKMAKER! Luuk de Jong kopt raak na een hoekschop. 1-1."
8. type: `substitution`, minute: 67 — "Wissel Ajax: Steven Berghuis vervangt Kian Fitz-Jim."

**Seed three articles:**

1. title: "Ajax en PSV strijden om de titel: wie heeft de beste selectie?" — background article about the match
2. title: "Eredivisie speelronde 28: alle duels op een rij" — overview article
3. title: "Bergwijn: 'We gaan voor de drie punten vanavond'" — interview article

Give articles realistic content (2-3 sentences each). Set `publishedAt` to timestamps in the last 24 hours.

Log each seeded item clearly. If items already exist, skip (check by ID before inserting).

---

## Step 6 — CDK

**Package name:** `@newswire/infra`

### Structure

```
infra/
├── bin/
│   └── newswire.ts
├── lib/
│   stacks/
│   │   ├── data-stack.ts
│   │   ├── api-stack.ts
│   │   └── frontend-stack.ts
│   └── constructs/
│       ├── sse-service.ts
│       └── authoring-function.ts
├── test/
│   ├── data-stack.test.ts
│   ├── api-stack.test.ts
│   └── frontend-stack.test.ts
├── cdk.json
├── package.json
└── tsconfig.json
```

### `bin/newswire.ts`

CDK app entry point. Read `env` from CDK context:

- `environment` — `'dev'` or `'prod'` (required)
- `awsAccountId` — AWS account ID (required)
- `awsRegion` — AWS region (default: `eu-west-1`)

Instantiate stacks in order: `DataStack` → `ApiStack` (depends on DataStack) → `FrontendStack` (depends on ApiStack).

Tag all stacks with `Project: newswire` and `Environment: <env>`.

### `lib/stacks/data-stack.ts`

**DynamoDB tables** — use `RemovalPolicy.RETAIN` in prod, `DESTROY` in dev:

- `articles` table — partition key: `articleId`
- `blogs` table — partition key: `blogId`
- `updates` table — partition key: `blogId`, sort key: `postedAt`

Enable Point-in-Time Recovery for prod.

**ElastiCache Redis cluster:**

- `CfnSubnetGroup`, `CfnReplicationGroup`
- Single node for dev, Multi-AZ for prod
- Engine: Redis 7

Export table ARNs and Redis endpoint as stack outputs.

### `lib/stacks/api-stack.ts`

Depends on `DataStack`. Creates:

**Lambda function (Authoring)** via `AuthoringFunction` construct:

- Runtime: `nodejs20.x`
- Handler: serves `POST /articles` and `POST /updates`
- Environment variables from DataStack outputs
- Grant read/write to DynamoDB tables
- Publishes to EventBridge bus

**API Gateway REST API:**

- `POST /articles` → Authoring Lambda
- `POST /updates` → Authoring Lambda
- `GET /articles` → Authoring Lambda
- `GET /blogs` → Authoring Lambda
- `GET /blogs/{blogId}` → Authoring Lambda

**ECS Fargate cluster + service** via `SseService` construct:

- Task definition with container from `apps/api` Docker image
- ALB with HTTPS listener (port 443) and HTTP redirect
- `GET /stream/{blogId}` routed to ECS target group
- ALB idle timeout: 300 seconds
- Container environment variables from DataStack outputs

**EventBridge bus:**

- Custom bus named `newswire-<env>`

### `lib/stacks/frontend-stack.ts`

Depends on `ApiStack`. Creates:

**S3 bucket** for Next.js static assets (if using static export) or for CloudFront origin.

**CloudFront distribution:**

- Default origin: S3 (frontend)
- Behavior `/api/articles*` → API Gateway (TTL 60s, cache GET only)
- Behavior `/stream/*` — **do not add this behavior**. SSE goes direct to ALB, not through CloudFront.
- Behavior `/api/*` → API Gateway (no cache)
- WAF WebACL with rate limiting rule (1000 requests per 5 minutes per IP)

### `lib/constructs/sse-service.ts`

L3 construct that encapsulates the ECS Fargate service + ALB for SSE. Exposes:

- `loadBalancerDnsName: string`
- `service: ecs.FargateService`

Configure ALB target group with:

- `deregistrationDelay: Duration.seconds(30)`
- Health check on `GET /blogs` (returns 200)

### `lib/constructs/authoring-function.ts`

L3 construct for the Authoring Lambda. Accepts DynamoDB table references and EventBridge bus as props. Handles IAM grants internally.

### CDK Tests (`test/`)

Use `@aws-cdk/assertions`. Test:

**`data-stack.test.ts`:**

- DynamoDB tables created with correct key schema
- Redis cluster created
- RemovalPolicy correct per environment

**`api-stack.test.ts`:**

- Lambda function created with correct runtime
- API Gateway routes exist
- ECS service created with correct port
- ALB idle timeout is 300 seconds

**`frontend-stack.test.ts`:**

- CloudFront distribution created
- Cache behavior for `/api/articles*` has TTL 60s
- WAF WebACL attached

---

## Step 7 — Playwright E2E tests

Create `apps/web/e2e/` folder.

### `e2e/homepage.spec.ts`

- Page loads and displays articles
- After 60 seconds (use `page.clock.tick` to fast-forward), articles are re-fetched
- New article appears after journalist posts it and poll interval elapses

### `e2e/liveblog.spec.ts`

- Page loads with initial updates from SSR
- SSE connection is established (LIVE badge visible)
- When journalist posts an update via API, it appears on the live blog without page refresh
- Timestamp of new update is correct

### `e2e/journalist.spec.ts`

- Journalist can publish an article — success message shown
- Journalist can post a live update — success message shown
- Form validation — empty fields show error

---

## Step 8 — Documentation

### `docs/architecture.md`

Write an Architecture Decision Record (ADR) for each key decision:

1. **ECS over Lambda for SSE** — reasoning: long-lived connections, ALB idle timeout 300s, cost profile at high fan-out
2. **Redis pub/sub as decoupling layer** — reasoning: any ECS node can serve any SSE connection, horizontal scaling
3. **EventBridge stub pattern** — reasoning: no local emulator, interface-based swap, testability
4. **CloudFront for articles, not for SSE** — reasoning: CloudFront buffers responses, SSE requires streaming
5. **API Gateway for Lambda, ALB for ECS** — reasoning: API Gateway natively integrates with Lambda, ALB needed for long-lived HTTP

### `docs/local-dev.md`

Step-by-step guide for running the project locally:

```
1. Prerequisites: Node.js 20+, pnpm, Docker
2. Clone repo
3. pnpm install
4. Copy .env.example to .env.local in each app
5. pnpm setup  (starts docker-compose, creates tables, seeds data)
6. pnpm dev    (starts all dev servers)
7. Open http://localhost:3000 (web)
8. Open http://localhost:3001 (api)
```

Include a section with curl examples for each API endpoint.

### `docs/demo-script.md`

A step-by-step script for running the live demo during the presentation:

```
1. Show the homepage — artikelen zichtbaar, timestamp zichtbaar
2. Open journalist UI in tweede tab
3. Publiceer een artikel via de journalist UI
4. Wacht op de volgende poll (max 60 seconden) — artikel verschijnt op homepage
5. Navigeer naar de live blog (Ajax - PSV)
6. Open de live blog in een tweede browservenster
7. Post een live update via de journalist UI (bijv. een doelpunt)
8. Beide vensters tonen de update direct — zonder refresh
9. Laat zien dat de homepage nog steeds pollt maar de live blog al heeft bijgewerkt
```

---

## Constraints summary

Never deviate from these without flagging explicitly:

- No `any` in TypeScript — use `unknown` with type guards
- No barrel files — import directly from source file
- No direct `process.env` access outside `env.ts`
- No shared Redis connection for pub/sub — always `createSubscriberClient()`
- No ALB in front of Lambda
- No SSE through CloudFront
- No API Gateway caching on top of CloudFront for public content
- No authentication (Cognito out of scope)
- No `// TODO` or placeholder code — all generated code must be complete and working
- Every module must have a corresponding test file
- All environment variables documented in `.env.example`
- DynamoDB table names always environment-prefixed via env vars
- Redis channels always use the `REDIS_CHANNELS` constant from `@newswire/types`
