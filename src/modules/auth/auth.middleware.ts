import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { UnauthorizedError } from "../../http/errors";
import { AuthRepository } from "./auth.repository";

const repository = new AuthRepository();

export async function requireAuth(
  request: Request,
  _response: Response,
  next: NextFunction
) {
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

    const user = await repository.findUserById(verified.sub);

    if (!user || !user.active) {
      throw new Error("Inactive user");
    }

    if (user.role !== verified.role) {
      throw new Error("Role changed");
    }

    if (
      user.role === "TENANT_ADMIN" &&
      (!user.tenantId ||
        typeof verified.tenantId !== "string" ||
        user.tenantId !== verified.tenantId)
    ) {
      throw new Error("Tenant scope changed");
    }

    if (user.role === "SUPER_ADMIN" && verified.tenantId !== undefined) {
      throw new Error("Invalid super admin scope");
    }

    request.auth = {
      userId: user.id,
      role: user.role,
      tenantId: user.tenantId ?? undefined
    };

    request.log = request.log?.child({
      userId: user.id,
      role: user.role,
      tenantId: user.tenantId ?? undefined
    });

    next();
  } catch {
    throw new UnauthorizedError();
  }
}
