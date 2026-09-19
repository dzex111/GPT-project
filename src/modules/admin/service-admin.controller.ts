import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { asyncHandler } from "../../http/async-handler";
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from "../../http/errors";
import { ServiceRepository } from "../services/service.repository";
import { resolveTenantId } from "./admin-scope";
import {
  createServiceSchema,
  updateServiceSchema
} from "./admin.schemas";

const services = new ServiceRepository();

export const listServices = asyncHandler(async (request: Request, response: Response) => {
  const tenantId = resolveTenantId(request, asOptionalString(request.query.tenantId));
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

  try {
    const service = await services.create({
      ...parsed.data,
      tenantId,
      parameters: parsed.data.parameters
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
  const parsed = updateServiceSchema.safeParse(request.body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }

  const existing = await services.findAnyByIdForTenant(
    resolveTenantId(request, asOptionalString(request.query.tenantId)),
    request.params.serviceId
  );

  if (!existing) {
    throw new NotFoundError("Service not found");
  }

  const result = await services.updateForTenant(
    existing.tenantId,
    existing.id,
    parsed.data
  );

  if (result.count !== 1) {
    throw new NotFoundError("Service not found");
  }

  const updated = await services.findAnyByIdForTenant(
    existing.tenantId,
    existing.id
  );

  response.json({
    data: updated
  });
});

export const deleteService = asyncHandler(async (request: Request, response: Response) => {
  const tenantId = resolveTenantId(request, asOptionalString(request.query.tenantId));
  const result = await services.deleteForTenant(tenantId, request.params.serviceId);

  if (result.count !== 1) {
    throw new NotFoundError("Service not found");
  }

  response.status(204).send();
});

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
