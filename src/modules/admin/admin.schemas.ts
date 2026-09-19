import { z } from "zod";

const businessHoursSchema = z.record(
  z.string(),
  z.object({
    open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  }).nullable()
);

const parameterOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1)
});

const parameterFieldSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  type: z.enum(["text", "select"]),
  required: z.boolean().default(true),
  options: z.array(parameterOptionSchema).default([])
});

const pricingRuleSchema = z.object({
  when: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  type: z.enum(["flat", "multiplier"]),
  amount: z.number().finite()
});

export const serviceParametersSchema = z.object({
  fields: z.array(parameterFieldSchema).default([]),
  pricingRules: z.array(pricingRuleSchema).default([])
});

export const createTenantSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  businessType: z.string().trim().min(2).max(80),
  countryCode: z.string().trim().regex(/^[A-Z]{2}$/),
  phoneNumber: z.string().trim().min(8).max(32),
  whatsappPhoneNumberId: z.string().trim().min(1).max(128),
  whatsappAccessToken: z.string().min(1),
  whatsappVerifyToken: z.string().min(1).max(255),
  whatsappAppSecret: z.string().min(1),
  googleCalendarId: z.string().trim().min(1).optional(),
  googleServiceAccountEmail: z.string().email().optional(),
  googleServiceAccountPrivateKey: z.string().min(1).optional(),
  googleOAuthClientId: z.string().min(1).optional(),
  googleOAuthClientSecret: z.string().min(1).optional(),
  googleOAuthRefreshToken: z.string().min(1).optional(),
  timezone: z.string().trim().min(1).max(100).default("Asia/Riyadh"),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("SAR"),
  bookingBufferMinutes: z.number().int().min(0).max(240).default(15),
  adminNotificationPhone: z.string().trim().min(8).max(32).optional(),
  businessHours: businessHoursSchema.optional()
}).superRefine((value, context) => {
  const serviceAccountCount = [
    value.googleServiceAccountEmail,
    value.googleServiceAccountPrivateKey,
    value.googleCalendarId
  ].filter(Boolean).length;

  if (serviceAccountCount !== 0 && serviceAccountCount !== 3) {
    context.addIssue({
      code: "custom",
      path: ["googleCalendarId"],
      message: "Google service account configuration requires calendar id, email, and private key"
    });
  }

  const oauthCount = [
    value.googleOAuthClientId,
    value.googleOAuthClientSecret,
    value.googleOAuthRefreshToken
  ].filter(Boolean).length;

  if (oauthCount !== 0 && oauthCount !== 3) {
    context.addIssue({
      code: "custom",
      path: ["googleOAuthRefreshToken"],
      message: "Google OAuth configuration requires client id, client secret, and refresh token"
    });
  }
});

export const updateTenantSchema = createTenantSchema.partial().omit({
  phoneNumber: true,
  whatsappPhoneNumberId: true
});

export const createServiceSchema = z.object({
  tenantId: z.string().cuid(),
  name: z.string().trim().min(2).max(160),
  basePriceMinor: z.number().int().min(0),
  durationMinutes: z.number().int().min(5).max(1440),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  parameters: serviceParametersSchema.default({ fields: [], pricingRules: [] }),
  active: z.boolean().default(true)
});

export const updateServiceSchema = createServiceSchema.omit({
  tenantId: true
}).partial();

export const bookingStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED"
]);
