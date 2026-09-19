import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(256)
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(4096)
});
