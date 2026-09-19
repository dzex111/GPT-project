import type { Request } from "express";
import { ForbiddenError, ValidationError } from "../../http/errors";

export function resolveTenantId(request: Request, requestedTenantId?: string) {
  if (request.admin?.role !== "admin") {
    throw new ForbiddenError();
  }

  if (request.admin.tenantId) {
    if (requestedTenantId && requestedTenantId !== request.admin.tenantId) {
      throw new ForbiddenError("Tenant access denied");
    }
    return request.admin.tenantId;
  }

  if (!requestedTenantId) {
    throw new ValidationError("tenantId is required");
  }

  return requestedTenantId;
}
