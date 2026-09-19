import type { Request } from "express";
import { ForbiddenError, ValidationError } from "../../http/errors";

export function resolveTenantId(request: Request, requestedTenantId?: string) {
  const auth = request.auth;

  if (!auth) {
    throw new ForbiddenError();
  }

  if (auth.role === "TENANT_ADMIN") {
    if (!auth.tenantId) {
      throw new ForbiddenError("Tenant access is not configured");
    }

    if (requestedTenantId && requestedTenantId !== auth.tenantId) {
      throw new ForbiddenError("Tenant access denied");
    }

    return auth.tenantId;
  }

  if (!requestedTenantId) {
    throw new ValidationError("tenantId is required for SUPER_ADMIN operations");
  }

  return requestedTenantId;
}
