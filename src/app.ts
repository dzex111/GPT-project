import express from "express";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { AppError } from "./http/errors";
import { whatsappRouter } from "./routes/whatsapp.routes";

export const app = express();

app.disable("x-powered-by");

app.use(express.json({
  limit: "256kb",
  verify: (request, _response, buffer) => {
    request.rawBody = Buffer.from(buffer);
  }
}));

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.use(
  "/webhooks/whatsapp",
  rateLimit({
    windowMs: env.WEBHOOK_RATE_LIMIT_WINDOW_MS,
    limit: env.WEBHOOK_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false
  }),
  whatsappRouter
);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: error.code,
      message: error.message
    });
    return;
  }

  logger.error({ err: error }, "Unhandled application error");
  response.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "Internal server error"
  });
});
