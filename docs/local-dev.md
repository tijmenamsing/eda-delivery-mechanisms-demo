# Local Development Guide

## Prerequisites

- Node.js 22+
- pnpm 8+
- Docker (for Redis and LocalStack)

## Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment files
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 3. Start infrastructure + seed data
pnpm setup

# 4. Start development servers
pnpm dev
```

This starts:

- **API** at `http://localhost:3001`
- **Web** at `http://localhost:3000`
- **Redis** at `localhost:6379`
- **LocalStack (DynamoDB)** at `localhost:4566`

## Demo Flow

1. Open the **Homepage** (`http://localhost:3000`) — shows articles, refreshes every 60 seconds
2. Open the **Live Blog** (`http://localhost:3000/blog/<blogId>`) — shows real-time updates via SSE
3. Open the **Journalist Panel** (`http://localhost:3000/journalist`) — post articles and live updates

### Demonstrating the difference:

- **Publish an article** → it appears on the homepage after the next 60-second poll
- **Post a live update** → it appears on the live blog instantly via SSE

## Useful Commands

| Command               | Description                            |
| --------------------- | -------------------------------------- |
| `pnpm run dev`        | Start all dev servers                  |
| `pnpm run build`      | Build all packages                     |
| `pnpm run test`       | Run all tests                          |
| `pnpm run infra:up`   | Start Docker containers                |
| `pnpm run infra:down` | Stop Docker containers                 |
| `pnpm run db:init`    | Create DynamoDB tables                 |
| `pnpm run db:seed`    | Seed demo data                         |
| `pnpm run setup`      | Full local setup (infra + init + seed) |
