import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { logger } from "../config/logger";

export function requestContext(request: Request, response: Response, next: NextFunction) {
  const correlationId = request.header("x-correlation-id")?.trim() || crypto.randomUUID();

  request.correlationId = correlationId;
  request.log = logger.child({
    correlationId,
    method: request.method,
    path: request.path
  });

  response.setHeader("x-correlation-id", correlationId);
  const startedAt = process.hrtime.bigint();

  request.log.info("request.started");

  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    request.log?.info({
      statusCode: response.statusCode,
      durationMs: Number(durationMs.toFixed(2))
    }, "request.completed");
  });

  next();
}
