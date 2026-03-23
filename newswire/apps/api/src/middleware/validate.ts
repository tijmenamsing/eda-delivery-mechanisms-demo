import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";

export function validate<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(err);
      } else {
        next(err);
      }
    }
  };
}
