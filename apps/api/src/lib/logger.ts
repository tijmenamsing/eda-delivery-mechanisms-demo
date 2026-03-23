import pino, { type LoggerOptions } from "pino";
import { env } from "./env.js";

const options: LoggerOptions = {
  level: env.NODE_ENV === "production" ? "info" : "debug",
  base: { service: "@bbtg-news/api" },
  timestamp: pino.stdTimeFunctions.isoTime,
};

if (env.NODE_ENV === "development") {
  options.transport = { target: "pino/file", options: { destination: 1 } };
}

export const logger = pino(options);
