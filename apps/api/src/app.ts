// Express app creation extracted for reuse by both the server (index.ts) and
// the Lambda handler (lambda.ts). This module MUST NOT call app.listen() or set
// up process signal handlers — those are concerns of the hosting runtime.

import express from "express";
import cors from "cors";
import { env } from "./lib/env.js";
import { requestId } from "./middleware/request-id.js";
import { errorHandler } from "./middleware/error.js";
import { createArticlesRouter } from "./routes/articles.js";
import { createUpdatesRouter } from "./routes/updates.js";
import { createBlogsRouter } from "./routes/blogs.js";
import { createStreamRouter } from "./routes/stream.js";
import { createChatRouter } from "./routes/chat.js";
import { createHealthRouter } from "./routes/health.js";
import { InProcessPublisher } from "./lib/events/inprocess.publisher.js";
import { EventBridgePublisher } from "./lib/events/eventbridge.publisher.js";
import type { EventPublisher } from "./lib/events/publisher.interface.js";

// Select event publisher based on config
const publisher: EventPublisher =
  env.EVENT_PUBLISHER === "eventbridge"
    ? new EventBridgePublisher()
    : new InProcessPublisher();

export const app: ReturnType<typeof express> = express();

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
app.use("/blogs", createBlogsRouter(publisher));
app.use("/stream", createStreamRouter());
app.use("/chat", createChatRouter());

// Error handler — must be last
app.use(errorHandler);
