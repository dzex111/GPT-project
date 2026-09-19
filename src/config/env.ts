import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  META_GRAPH_API_VERSION: z.string().min(1),
  ADMIN_JWT_SECRET: z.string().min(32),
  WEBHOOK_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  WEBHOOK_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  ADMIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  ADMIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  OUTBOUND_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  BOOKING_SLOT_INTERVAL_MINUTES: z.coerce.number().int().positive().default(30),
  CALENDAR_HORIZON_DAYS: z.coerce.number().int().positive().max(31).default(14),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_OAUTH_REFRESH_TOKEN: z.string().min(1).optional()
}).superRefine((value, context) => {
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
});

export const env = envSchema.parse(process.env);
