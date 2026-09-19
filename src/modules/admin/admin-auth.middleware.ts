import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { UnauthorizedError } from "../../http/errors";

type AdminClaims = {
  role?: unknown;
  tenantId?: unknown;
  sub?: unknown;
};

export function requireAdmin(request: Request, _response: Response, next: NextFunction) {
  const header = request.header("authorization");

  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError();
  }

  const token = header.slice(7).trim();

  if (!token) {
    throw new UnauthorizedError();
  }

  let payload: string | jwt.JwtPayload;

  try {
    payload = jwt.verify(token, env.ADMIN_JWT_SECRET, {
      algorithms: ["HS256"]
    });
  } catch {
    throw new UnauthorizedError();
  }

  if (typeof payload === "string") {
    throw new UnauthorizedError();
  }

  const claims = payload as AdminClaims;

  if (claims.role !== "admin") {
    throw new UnauthorizedError();
  }

  request.admin = {
    role: "admin",
    tenantId: typeof claims.tenantId === "string" ? claims.tenantId : undefined,
    subject: typeof claims.sub === "string" ? claims.sub : undefined
  };

  next();
}
