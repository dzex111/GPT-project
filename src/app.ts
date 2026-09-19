import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";
import { asyncHandler } from "./http/async-handler";
import { errorHandler } from "./http/error-handler";
import { requestContext } from "./http/request-context.middleware";
import { whatsappRouter } from "./routes/whatsapp.routes";
import { internalRouter } from "./routes/internal.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { authRouter } from "./modules/auth/auth.routes";

export const app = express();

app.disable("x-powered-by");

app.use(helmet());

const corsOrigins = env.CORS_ORIGINS
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  }
}));

app.use(requestContext);

app.use(express.json({
  limit: "256kb",
  verify: (request, _response, buffer) => {
    request.rawBody = Buffer.from(buffer);
  }
}));

app.get(
  "/health",
  asyncHandler(async (request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.status(200).json({
        status: "ok",
        database: "ok",
        correlationId: request.correlationId
      });
    } catch (error) {
      request.log?.error({ err: error }, "health.database_unavailable");
      response.status(503).json({
        status: "degraded",
        database: "unavailable",
        correlationId: request.correlationId
      });
    }
  })
);

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

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/internal", internalRouter);

app.use(errorHandler);
