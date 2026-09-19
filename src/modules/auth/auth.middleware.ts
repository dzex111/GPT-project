import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { UnauthorizedError } from "../../http/errors";

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const header = request.header("authorization");

  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError();
  }

  const token = header.slice(7).trim();

  try {
    const verified = jwt.verify(token, env.ADMIN_JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    });

    if (typeof verified === "string") {
      throw new Error("Invalid token");
    }

    if (
      verified.type !== "access" ||
      typeof verified.sub !== "string" ||
      (verified.role !== "SUPER_ADMIN" && verified.role !== "TENANT_ADMIN")
    ) {
      throw new Error("Invalid token");
    }

    request.auth = {
      userId: verified.sub,
      role: verified.role,
      tenantId: typeof verified.tenantId === "string" ? verified.tenantId : undefined
    };

    request.log = request.log?.child({
      userId: verified.sub,
      role: verified.role,
      tenantId: typeof verified.tenantId === "string" ? verified.tenantId : undefined
    });
    next();
  } catch {
    throw new UnauthorizedError();
  }
}
