import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = req.log ?? logger;

  if (err instanceof ZodError) {
    const message = err.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message },
    });
    return;
  }

  if (
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof err.status === "number"
  ) {
    const status = err.status;
    const message =
      "message" in err && typeof err.message === "string"
        ? err.message
        : "Request error";
    res.status(status).json({
      error: { code: "REQUEST_ERROR", message },
    });
    return;
  }

  log.error({ err }, "Unhandled error");

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
};
