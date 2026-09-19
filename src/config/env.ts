import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  META_GRAPH_API_VERSION: z.string().min(1),
  WEBHOOK_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  WEBHOOK_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  OUTBOUND_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10000)
});

export const env = envSchema.parse(process.env);
