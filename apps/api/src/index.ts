// Load .env file before anything else — in production (ECS/Lambda) env vars are
// already set, so dotenv is a no-op. Must be the first import so process.env is
// populated before env.ts validates it.
import "dotenv/config";
import { app } from "./app.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { disconnectRedis } from "./lib/redis.js";
import { setupWebSocket, closeWebSocket } from "./ws/setup.js";

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      eventPublisher: env.EVENT_PUBLISHER,
      nodeEnv: env.NODE_ENV,
    },
    `BBTG Nieuws API listening on port ${env.PORT}`,
  );
});

// Attach WebSocket server to the HTTP server (ECS only — Lambda doesn't reach here)
setupWebSocket(server);

// Graceful shutdown
function shutdown(signal: string): void {
  logger.info({ signal }, "Received shutdown signal, draining connections...");
  server.close(async () => {
    await closeWebSocket();
    await disconnectRedis();
    logger.info("Server shut down gracefully");
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.warn("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
