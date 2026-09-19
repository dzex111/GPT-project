import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NETLIFY_DB_URL: z.string().min(1),
  META_GRAPH_API_VERSION: z.string().min(1),
  META_VERIFY_TOKEN: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  ADMIN_JWT_SECRET: z.string().min(32).optional(),
  JWT_SECRET: z.string().min(32).optional(),
  JWT_ISSUER: z.string().min(1).default("gcc-booking-engine"),
  JWT_AUDIENCE: z.string().min(1).default("gcc-booking-api"),
  ACCESS_TOKEN_TTL: z.string().min(2).default("15m"),
  REFRESH_TOKEN_TTL: z.string().min(2).default("30d"),
  WEBHOOK_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  WEBHOOK_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  ADMIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  ADMIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  OUTBOUND_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  BOOKING_SLOT_INTERVAL_MINUTES: z.coerce.number().int().positive().default(30),
  CALENDAR_HORIZON_DAYS: z.coerce.number().int().positive().max(31).default(14),
  CORS_ORIGINS: z.string().default(""),
  INTERNAL_API_KEY_HEADER: z.string().regex(/^[A-Za-z0-9-]+$/).default("x-api-key"),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GOOGLE_PRIVATE_KEY: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_OAUTH_REFRESH_TOKEN: z.string().min(1).optional()
}).superRefine((value, context) => {
  if (!value.ADMIN_JWT_SECRET && !value.JWT_SECRET) {
    context.addIssue({
      code: "custom",
      path: ["JWT_SECRET"],
      message: "JWT_SECRET or ADMIN_JWT_SECRET must be configured"
    });
  }

  const oauthCount = [
    value.GOOGLE_OAUTH_CLIENT_ID,
    value.GOOGLE_OAUTH_CLIENT_SECRET,
    value.GOOGLE_OAUTH_REFRESH_TOKEN
  ].filter(Boolean).length;

  if (oauthCount !== 0 && oauthCount !== 3) {
    context.addIssue({
      code: "custom",
      message: "Google OAuth environment configuration must include all three credentials or none"
    });
  }

  if (
    (value.GOOGLE_SERVICE_ACCOUNT_EMAIL && !value.GOOGLE_PRIVATE_KEY) ||
    (!value.GOOGLE_SERVICE_ACCOUNT_EMAIL && value.GOOGLE_PRIVATE_KEY)
  ) {
    context.addIssue({
      code: "custom",
      message: "Google service account configuration requires both email and private key"
    });
  }

  if (value.NODE_ENV === "production" && value.CORS_ORIGINS.trim().length === 0) {
    context.addIssue({
      code: "custom",
      message: "CORS_ORIGINS must be configured in production"
    });
  }
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  ADMIN_JWT_SECRET: parsedEnv.ADMIN_JWT_SECRET ?? parsedEnv.JWT_SECRET!
};
