# BBTG Nieuws — EDA Delivery Mechanisms Demo

A digital news platform built to demonstrate three real-time delivery patterns side-by-side in an event-driven architecture. Built for the **Navara Kennisfestival 2026**.

| Pattern                | Use case          | How it works                                          |
| ---------------------- | ----------------- | ----------------------------------------------------- |
| **Polling**            | Homepage articles | `setInterval` every 10 s; CloudFront caches responses |
| **Server-Sent Events** | Live blog updates | `EventSource` → ALB → ECS ← Redis Streams             |
| **WebSocket**          | Live chat         | `WebSocket` → ALB → ECS ← Redis pub/sub               |

The write side (Editorial) and read side (Delivery) are split into separate bounded contexts communicating through **AWS EventBridge**. Locally, an in-process publisher simulates the full event flow without requiring AWS credentials.

→ See [docs/architecture.md](docs/architecture.md) for the full architectural decision record.  
→ See [docs/demo-script.md](docs/demo-script.md) for a step-by-step presentation guide.

---

## Repo structure

```
apps/
  api/        # Express server — Lambda (CRUD) + ECS (SSE + WebSocket)
  web/        # Next.js static export — homepage, live blog, journalist UI
packages/
  types/      # Shared Zod schemas and TypeScript types
infra/        # AWS CDK app — VPC, DynamoDB, ElastiCache, ECS, CloudFront
scripts/      # init-local.ts, seed.ts, deploy-web.ts
docs/         # Architecture ADRs, local dev guide, demo script
```

---

## Quick start (local)

See [docs/local-dev.md](docs/local-dev.md) for the full guide, including curl examples for every endpoint.

**Prerequisites:** Node.js 22+, pnpm, Docker

```bash
pnpm install
pnpm setup   # starts Docker (Redis + LocalStack), creates tables, seeds data
pnpm dev     # starts API on :3001 and web on :3000
```

Open:

- `http://localhost:3000` — homepage (polling)
- `http://localhost:3000/blog/<blogId>` — live blog (SSE + chat)
- `http://localhost:3000/journalist` — journalist panel (post articles and updates)

---

## Key commands

| Command           | Description                                   |
| ----------------- | --------------------------------------------- |
| `pnpm dev`        | Start all dev servers                         |
| `pnpm build`      | Build all packages                            |
| `pnpm test`       | Run all unit tests                            |
| `pnpm lint`       | TypeScript type-check all packages            |
| `pnpm setup`      | Full local setup: Docker → init tables → seed |
| `pnpm infra:up`   | Start Docker containers only                  |
| `pnpm infra:down` | Stop Docker containers                        |
| `pnpm db:init`    | (Re-)create DynamoDB tables in LocalStack     |
| `pnpm db:seed`    | Seed demo data (articles, blog, updates)      |

---

## Deploy to AWS

Infrastructure is managed with AWS CDK. The web frontend is a Next.js static export uploaded to S3 and served via CloudFront.

```bash
# First-time only: bootstrap CDK in the target account/region
pnpm cdk:bootstrap

# Deploy infrastructure (CDK) + web (S3 + CloudFront)
pnpm deploy

# Tear down all stacks
pnpm destroy
```

`pnpm deploy` runs `deploy:infra` then `deploy:web` in sequence. The web deploy script fetches the live API Gateway and ALB URLs from CloudFormation, seeds DynamoDB, builds the static export, syncs to S3, and invalidates CloudFront.

Requires an AWS profile named `personal` (configurable in `package.json`).
