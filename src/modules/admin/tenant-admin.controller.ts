import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { asyncHandler } from "../../http/async-handler";
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from "../../http/errors";
import { TenantRepository } from "../tenants/tenant.repository";
import { resolveTenantId } from "./admin-scope";
import { createTenantSchema, updateTenantSchema } from "./admin.schemas";

const tenants = new TenantRepository();

export const createTenant = asyncHandler(async (request: Request, response: Response) => {
  const parsed = createTenantSchema.safeParse(request.body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }

  try {
    const tenant = await tenants.create(parsed.data);

    response.status(201).json({
      data: serializeTenant(tenant)
    });
  } catch (error) {
    throw mapPrismaError(error);
  }
});

export const getTenant = asyncHandler(async (request: Request, response: Response) => {
  const tenantId = resolveTenantId(request, asRequiredString(request.params.tenantId, "tenantId"));
  const tenant = await tenants.findById(tenantId);

  if (!tenant) {
    throw new NotFoundError("Tenant not found");
  }

  response.json({
    data: serializeTenant(tenant)
  });
});

export const updateTenant = asyncHandler(async (request: Request, response: Response) => {
  const tenantId = resolveTenantId(request, asRequiredString(request.params.tenantId, "tenantId"));
  const parsed = updateTenantSchema.safeParse(request.body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }

  const existing = await tenants.findById(tenantId);

  if (!existing) {
    throw new NotFoundError("Tenant not found");
  }

  try {
    const tenant = await tenants.updateById(tenantId, parsed.data);

    response.json({
      data: serializeTenant(tenant)
    });
  } catch (error) {
    throw mapPrismaError(error);
  }
});

function serializeTenant(tenant: Awaited<ReturnType<TenantRepository["findById"]>>) {
  if (!tenant) {
    return null;
  }

  return {
    id: tenant.id,
    businessName: tenant.businessName,
    businessType: tenant.businessType,
    countryCode: tenant.countryCode,
    phoneNumber: tenant.phoneNumber,
    whatsappPhoneNumberId: tenant.whatsappPhoneNumberId,
    googleCalendarId: tenant.googleCalendarId,
    timezone: tenant.timezone,
    currency: tenant.currency,
    bookingBufferMinutes: tenant.bookingBufferMinutes,
    adminNotificationPhone: tenant.adminNotificationPhone,
    businessHours: tenant.businessHours,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt
  };
}

function mapPrismaError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new ConflictError("A unique tenant field already exists");
  }

  return error;
}

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
