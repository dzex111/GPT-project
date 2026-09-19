import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { asyncHandler } from "../../http/async-handler";
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from "../../http/errors";
import { ServiceRepository } from "../services/service.repository";
import { TenantRepository } from "../tenants/tenant.repository";
import { resolveTenantId } from "./admin-scope";
import {
  createServiceSchema,
  updateServiceSchema
} from "./admin.schemas";

const services = new ServiceRepository();
const tenants = new TenantRepository();

export const listServices = asyncHandler(async (request: Request, response: Response) => {
  const tenantId = resolveTenantId(request, asOptionalString(request.query.tenantId));
  const tenant = await tenants.findById(tenantId);

  if (!tenant) {
    throw new NotFoundError("Tenant not found");
  }

  const result = await services.listForTenant(tenantId);

  response.json({
    data: result
  });
});

export const createService = asyncHandler(async (request: Request, response: Response) => {
  const parsed = createServiceSchema.safeParse(request.body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }

  const tenantId = resolveTenantId(request, parsed.data.tenantId);
  const tenant = await tenants.findById(tenantId);

  if (!tenant) {
    throw new NotFoundError("Tenant not found");
  }

  try {
    const service = await services.create({
      ...parsed.data,
      tenantId,
      parameters: parsed.data.parameters as Prisma.InputJsonValue
    });

    response.status(201).json({
      data: service
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("A service with this name already exists for the tenant");
    }

    throw error;
  }
});

export const updateService = asyncHandler(async (request: Request, response: Response) => {
  const tenantId = resolveTenantId(request, asOptionalString(request.query.tenantId));
  const serviceId = asRequiredString(request.params.serviceId, "serviceId");
  const parsed = updateServiceSchema.safeParse(request.body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }

  const existing = await services.findAnyByIdForTenant(
    tenantId,
    serviceId
  );

  if (!existing) {
    throw new NotFoundError("Service not found");
  }

  try {
    const result = await services.updateForTenant(
      tenantId,
      existing.id,
      {
        ...parsed.data,
        ...(parsed.data.parameters
          ? { parameters: parsed.data.parameters as Prisma.InputJsonValue }
          : {})
      }
    );

    if (result.count !== 1) {
      throw new NotFoundError("Service not found");
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("A service with this name already exists for the tenant");
    }

    throw error;
  }

  const updated = await services.findAnyByIdForTenant(
    tenantId,
    existing.id
  );

  response.json({
    data: updated
  });
});

export const deleteService = asyncHandler(async (request: Request, response: Response) => {
  const tenantId = resolveTenantId(request, asOptionalString(request.query.tenantId));
  const serviceId = asRequiredString(request.params.serviceId, "serviceId");
  const result = await services.deleteForTenant(tenantId, serviceId);

  if (result.count !== 1) {
    throw new NotFoundError("Service not found");
  }

  response.status(204).send();
});

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asRequiredString(value: unknown, field: string) {
  const result = asOptionalString(value);

  if (!result) {
    throw new ValidationError(`Invalid ${field}`);
  }

  return result;
}
