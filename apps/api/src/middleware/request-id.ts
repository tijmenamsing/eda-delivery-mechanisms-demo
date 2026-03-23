import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger.js";

export function requestId(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const traceId =
    (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
  req.log = logger.child({ traceId });
  next();
}
