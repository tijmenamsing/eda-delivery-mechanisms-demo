# Multi-stage build for the BBTG Nieuws API.
# Docker context MUST be the monorepo root so we can resolve workspace deps.
#
#   docker build -f apps/api/Dockerfile .

# ---------- build ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace root files needed for pnpm install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy workspace packages that the API depends on
COPY packages/types/ packages/types/
COPY apps/api/ apps/api/

RUN corepack enable && pnpm install --frozen-lockfile

# Build types first (API depends on it)
RUN pnpm --filter @bbtg-news/types build
# Build the API
RUN pnpm --filter @bbtg-news/api build

# ---------- runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy workspace root files for pnpm install
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/tsconfig.base.json ./

# Copy types package (dist + package.json so Node.js can resolve exports)
COPY --from=builder /app/packages/types/package.json packages/types/package.json
COPY --from=builder /app/packages/types/dist/ packages/types/dist/

# Copy API compiled output
COPY --from=builder /app/apps/api/package.json apps/api/package.json
COPY --from=builder /app/apps/api/dist/ apps/api/dist/

RUN corepack enable && pnpm install --frozen-lockfile --prod

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
