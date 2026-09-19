import type { Request, Response } from "express";
import { asyncHandler } from "../../http/async-handler";
import { ValidationError } from "../../http/errors";
import { AuthService } from "./auth.service";
import { loginSchema, refreshSchema } from "./auth.schemas";

const auth = new AuthService();

export const login = asyncHandler(async (request: Request, response: Response) => {
  const parsed = loginSchema.safeParse(request.body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }

  const tokens = await auth.login(parsed.data.email, parsed.data.password);

  response.json({
    data: tokens
  });
});

export const refresh = asyncHandler(async (request: Request, response: Response) => {
  const parsed = refreshSchema.safeParse(request.body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }

  const tokens = await auth.refresh(parsed.data.refreshToken);

  response.json({
    data: tokens
  });
});
