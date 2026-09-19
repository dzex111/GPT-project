import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { asyncHandler } from "../../http/async-handler";
import { ConflictError, NotFoundError, ValidationError } from "../../http/errors";
import { TenantRepository } from "../tenants/tenant.repository";
import { resolveTenantId } from "./admin-scope";
import { updateTenantSettingsSchema } from "./admin.schemas";

const tenants = new TenantRepository();

export const updateTenantSettings = asyncHandler(async (request: Request, response: Response) => {
  const parsed = updateTenantSettingsSchema.safeParse(request.body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }

  const tenantId = resolveTenantId(request, parsed.data.tenantId);
  const existing = await tenants.findById(tenantId);

  if (!existing) {
    throw new NotFoundError("Tenant not found");
  }

  const {
    tenantId: _tenantId,
    autoQuoteParameters,
    ...settings
  } = parsed.data;

  const data: Prisma.TenantUpdateInput = {
    ...settings,
    ...(autoQuoteParameters !== undefined
      ? { autoQuoteParameters: autoQuoteParameters as Prisma.InputJsonValue }
      : {})
  };

  try {
    const tenant = await tenants.updateById(tenantId, data);

    response.json({
      data: serializeTenantSettings(tenant)
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("Tenant settings conflict with an existing value");
    }

    throw error;
  }
});

function serializeTenantSettings(tenant: NonNullable<Awaited<ReturnType<TenantRepository["findById"]>>>) {
  return {
    id: tenant.id,
    businessName: tenant.businessName,
    businessType: tenant.businessType,
    countryCode: tenant.countryCode,
    phoneNumber: tenant.phoneNumber,
    whatsappPhoneNumberId: tenant.whatsappPhoneNumberId,
    timezone: tenant.timezone,
    currency: tenant.currency,
    bookingBufferMinutes: tenant.bookingBufferMinutes,
    businessHours: tenant.businessHours,
    autoQuoteParameters: tenant.autoQuoteParameters,
    adminNotificationPhone: tenant.adminNotificationPhone,
    googleCalendarId: tenant.googleCalendarId,
    hasWhatsAppCredentials: Boolean(
      tenant.whatsappAccessToken &&
      tenant.whatsappVerifyToken &&
      tenant.whatsappAppSecret
    ),
    hasGoogleServiceAccount: Boolean(
      tenant.googleCalendarId &&
      tenant.googleServiceAccountEmail &&
      tenant.googleServiceAccountPrivateKey
    ),
    hasGoogleOAuth: Boolean(
      tenant.googleOAuthClientId &&
      tenant.googleOAuthClientSecret &&
      tenant.googleOAuthRefreshToken
    ),
    updatedAt: tenant.updatedAt
  };
}
