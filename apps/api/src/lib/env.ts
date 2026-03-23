import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  DYNAMODB_ENDPOINT: z.string().url().optional(),
  REDIS_URL: z.string().min(1),
  ARTICLES_TABLE: z.string().min(1),
  BLOGS_TABLE: z.string().min(1),
  UPDATES_TABLE: z.string().min(1),
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
