import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const businessHours = {
  "0": null,
  "1": { open: "09:00", close: "19:00" },
  "2": { open: "09:00", close: "19:00" },
  "3": { open: "09:00", close: "19:00" },
  "4": { open: "09:00", close: "19:00" },
  "5": { open: "14:00", close: "19:00" },
  "6": { open: "10:00", close: "16:00" }
};

const tenantInput = {
  businessName: "Gulf Auto Detailing Center",
  businessType: "auto_detailing",
  countryCode: "SA",
  phoneNumber: "966500000000",
  whatsappPhoneNumberId: "demo-gulf-auto-phone-id",
  whatsappAccessToken: process.env.SEED_WHATSAPP_ACCESS_TOKEN ?? "demo-access-token",
  whatsappVerifyToken: process.env.SEED_WHATSAPP_VERIFY_TOKEN ?? "demo-gulf-auto-verify",
  whatsappAppSecret: process.env.SEED_WHATSAPP_APP_SECRET ?? "demo-gulf-auto-app-secret",
  timezone: "Asia/Riyadh",
  currency: "SAR",
  bookingBufferMinutes: 15,
  adminNotificationPhone: process.env.SEED_ADMIN_NOTIFICATION_PHONE ?? null,
  businessHours,
  googleCalendarId: process.env.SEED_GOOGLE_CALENDAR_ID ?? null,
  googleServiceAccountEmail: process.env.SEED_GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
  googleServiceAccountPrivateKey: process.env.SEED_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? null,
  googleOAuthClientId: process.env.SEED_GOOGLE_OAUTH_CLIENT_ID ?? null,
  googleOAuthClientSecret: process.env.SEED_GOOGLE_OAUTH_CLIENT_SECRET ?? null,
  googleOAuthRefreshToken: process.env.SEED_GOOGLE_OAUTH_REFRESH_TOKEN ?? null
};

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: {
      phoneNumber: tenantInput.phoneNumber
    },
    update: {
      businessName: tenantInput.businessName,
      businessType: tenantInput.businessType,
      countryCode: tenantInput.countryCode,
      timezone: tenantInput.timezone,
      currency: tenantInput.currency,
      bookingBufferMinutes: tenantInput.bookingBufferMinutes,
      adminNotificationPhone: tenantInput.adminNotificationPhone,
      businessHours: tenantInput.businessHours,
      ...(tenantInput.googleCalendarId
        ? { googleCalendarId: tenantInput.googleCalendarId }
        : {}),
      ...(tenantInput.googleServiceAccountEmail
        ? { googleServiceAccountEmail: tenantInput.googleServiceAccountEmail }
        : {}),
      ...(tenantInput.googleServiceAccountPrivateKey
        ? { googleServiceAccountPrivateKey: tenantInput.googleServiceAccountPrivateKey }
        : {}),
      ...(tenantInput.googleOAuthClientId
        ? { googleOAuthClientId: tenantInput.googleOAuthClientId }
        : {}),
      ...(tenantInput.googleOAuthClientSecret
        ? { googleOAuthClientSecret: tenantInput.googleOAuthClientSecret }
        : {}),
      ...(tenantInput.googleOAuthRefreshToken
        ? { googleOAuthRefreshToken: tenantInput.googleOAuthRefreshToken }
        : {})
    },
    create: tenantInput
  });

  const services = [
    {
      name: "Full Polish",
      basePriceMinor: 85000,
      durationMinutes: 180,
      currency: "SAR",
      parameters: {
        fields: [
          {
            key: "vehicleType",
            label: "Vehicle type",
            type: "select",
            required: true,
            options: [
              { value: "sedan", label: "Sedan" },
              { value: "suv", label: "SUV / 4x4" }
            ]
          }
        ],
        pricingRules: [
          {
            when: { vehicleType: "suv" },
            type: "flat",
            amount: 20000
          }
        ]
      }
    },
    {
      name: "Ceramic Coating",
      basePriceMinor: 180000,
      durationMinutes: 300,
      currency: "SAR",
      parameters: {
        fields: [
          {
            key: "vehicleType",
            label: "Vehicle type",
            type: "select",
            required: true,
            options: [
              { value: "sedan", label: "Sedan" },
              { value: "suv", label: "SUV / 4x4" }
            ]
          },
          {
            key: "paintCondition",
            label: "Paint condition",
            type: "select",
            required: true,
            options: [
              { value: "good", label: "Good" },
              { value: "needsCorrection", label: "Needs correction" }
            ]
          }
        ],
        pricingRules: [
          {
            when: { vehicleType: "suv" },
            type: "flat",
            amount: 30000
          },
          {
            when: { paintCondition: "needsCorrection" },
            type: "flat",
            amount: 45000
          }
        ]
      }
    },
    {
      name: "Premium Wash",
      basePriceMinor: 18000,
      durationMinutes: 60,
      currency: "SAR",
      parameters: {
        fields: [
          {
            key: "vehicleType",
            label: "Vehicle type",
            type: "select",
            required: true,
            options: [
              { value: "sedan", label: "Sedan" },
              { value: "suv", label: "SUV / 4x4" }
            ]
          }
        ],
        pricingRules: [
          {
            when: { vehicleType: "suv" },
            type: "flat",
            amount: 5000
          }
        ]
      }
    }
  ];

  for (const service of services) {
    await prisma.service.upsert({
      where: {
        tenantId_name: {
          tenantId: tenant.id,
          name: service.name
        }
      },
      update: {
        basePriceMinor: service.basePriceMinor,
        durationMinutes: service.durationMinutes,
        currency: service.currency,
        parameters: service.parameters,
        active: true
      },
      create: {
        tenantId: tenant.id,
        name: service.name,
        basePriceMinor: service.basePriceMinor,
        durationMinutes: service.durationMinutes,
        currency: service.currency,
        parameters: service.parameters,
        active: true
      }
    });
  }

  console.log(`Seeded tenant ${tenant.id} with ${services.length} services.`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
