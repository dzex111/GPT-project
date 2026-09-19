import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  base: {
    service: "gcc-whatsapp-booking-engine",
    environment: env.NODE_ENV
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "request.headers.authorization",
      "request.headers.cookie",
      "*.password",
      "*.passwordHash",
      "*.whatsappAccessToken",
      "*.whatsappAppSecret",
      "*.googleServiceAccountPrivateKey",
      "*.googleOAuthClientSecret",
      "*.googleOAuthRefreshToken",
      "*.apiKey",
      "*.refreshToken"
    ],
    censor: "[REDACTED]"
  }
});
