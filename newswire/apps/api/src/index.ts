import express from "express";
import cors from "cors";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error.js";
import { createArticlesRouter } from "./routes/articles.js";
import { createUpdatesRouter } from "./routes/updates.js";
import { createBlogsRouter } from "./routes/blogs.js";
import { createStreamRouter } from "./routes/stream.js";
import { createHealthRouter } from "./routes/health.js";
import { InProcessPublisher } from "./lib/events/inprocess.publisher.js";
import { EventBridgePublisher } from "./lib/events/eventbridge.publisher.js";
import type { EventPublisher } from "./lib/events/publisher.interface.js";
import { disconnectRedis } from "./lib/redis.js";

// Select event publisher based on config
const publisher: EventPublisher =
  env.EVENT_PUBLISHER === "eventbridge"
    ? new EventBridgePublisher()
    : new InProcessPublisher();

const app: ReturnType<typeof express> = express();

app.use(
  cors({
    origin: env.ALLOWED_ORIGIN,
    methods: ["GET", "POST"],
  }),
);
app.use(express.json());
app.use(requestId);

// Routes
app.use("/health", createHealthRouter());
app.use("/articles", createArticlesRouter(publisher));
app.use("/updates", createUpdatesRouter(publisher));
app.use("/blogs", createBlogsRouter());
app.use("/stream", createStreamRouter());

// Error handler — must be last
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      eventPublisher: env.EVENT_PUBLISHER,
      nodeEnv: env.NODE_ENV,
    },
    `NewsWire API listening on port ${env.PORT}`,
  );
});

// Graceful shutdown
function shutdown(signal: string): void {
  logger.info({ signal }, "Received shutdown signal, draining connections...");
  server.close(async () => {
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

// Export app for testing
export { app };
