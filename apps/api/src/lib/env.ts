import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  AWS_REGION: z.string().min(1),
  // Optional: only needed for local dev (LocalStack). On ECS/Lambda the
  // task/execution role provides credentials via the metadata service.
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  DYNAMODB_ENDPOINT: z.string().url().optional(),
  REDIS_URL: z.string().min(1),
  // Editorial context tables (writes)
  EDITORIAL_ARTICLES_TABLE: z.string().min(1),
  EDITORIAL_BLOGS_TABLE: z.string().min(1),
  EDITORIAL_UPDATES_TABLE: z.string().min(1),
  // Delivery context tables (reads + materialization)
  DELIVERY_ARTICLES_TABLE: z.string().min(1),
  DELIVERY_BLOGS_TABLE: z.string().min(1),
  DELIVERY_UPDATES_TABLE: z.string().min(1),
  DELIVERY_CHAT_MESSAGES_TABLE: z.string().min(1).default("dev-delivery-chat-messages"),
  EVENT_PUBLISHER: z.enum(["inprocess", "eventbridge"]).default("inprocess"),
  EVENTBRIDGE_BUS_NAME: z.string().optional(),
  ALLOWED_ORIGIN: z.string().default("http://localhost:3000"),
});

function validateEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `❌ Invalid environment variables:\n${formatted}\n\nCheck your .env file or environment configuration.`,
    );
  }

  const parsed = result.data;

  if (
    parsed.EVENT_PUBLISHER === "eventbridge" &&
    !parsed.EVENTBRIDGE_BUS_NAME
  ) {
    throw new Error(
      "❌ EVENTBRIDGE_BUS_NAME is required when EVENT_PUBLISHER=eventbridge",
    );
  }

  return parsed;
}

export const env = validateEnv();
