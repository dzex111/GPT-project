import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { env } from "../../config/env";
import { AuthRepository } from "./auth.repository";
import { UnauthorizedError } from "../../http/errors";

const repository = new AuthRepository();

export function requireApiKey(request: Request, _response: Response, next: NextFunction) {
  const rawKey = request.header(env.INTERNAL_API_KEY_HEADER)?.trim();

  if (!rawKey) {
    throw new UnauthorizedError();
  }

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  void repository.findApiKeyByHash(keyHash).then(key => {
    if (!key) {
      throw new UnauthorizedError();
    }

    request.log = request.log?.child({
      apiKeyPrefix: key.prefix,
      tenantId: key.tenantId ?? undefined
    });

    void repository.touchApiKey(key.id);

    if (key.tenantId) {
      request.auth = {
        userId: key.createdByUserId,
        role: "TENANT_ADMIN",
        tenantId: key.tenantId
      };
    }

    next();
  }).catch(next);
}
