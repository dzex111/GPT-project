import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env";
import { login, refresh } from "./auth.controller";

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false
});

authRouter.post("/login", limiter, login);
authRouter.post("/refresh", limiter, refresh);
