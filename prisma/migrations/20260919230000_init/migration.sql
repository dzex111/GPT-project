CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

CREATE TYPE "ConversationStep" AS ENUM (
  'SERVICE_SELECTION',
  'PARAMETER_COLLECTION',
  'QUOTING',
  'SLOT_LOOKUP',
  'AWAITING_CONFIRMATION',
  'BOOKED'
);

CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "businessType" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "whatsappPhoneNumberId" TEXT NOT NULL,
  "whatsappAccessToken" TEXT NOT NULL,
  "whatsappVerifyToken" TEXT NOT NULL,
  "whatsappAppSecret" TEXT NOT NULL,
  "googleCalendarId" TEXT,
  "googleServiceAccountEmail" TEXT,
  "googleServiceAccountPrivateKey" TEXT,
  "googleOAuthClientId" TEXT,
  "googleOAuthClientSecret" TEXT,
  "googleOAuthRefreshToken" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  "currency" TEXT NOT NULL DEFAULT 'SAR',
  "bookingBufferMinutes" INTEGER NOT NULL DEFAULT 15,
  "adminNotificationPhone" TEXT,
  "businessHours" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Service" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "basePriceMinor" INTEGER NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "parameters" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Booking" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "customerName" TEXT,
  "customerEmail" TEXT,
  "customerParameters" JSONB NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
  "calendarEventId" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "priceMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationState" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "customerName" TEXT,
  "step" "ConversationStep" NOT NULL DEFAULT 'SERVICE_SELECTION',
  "serviceId" TEXT,
  "collectedParameters" JSONB,
  "quotedPriceMinor" INTEGER,
  "selectedSlotStart" TIMESTAMP(3),
  "selectedSlotEnd" TIMESTAMP(3),
  "availableSlots" JSONB,
  "bookingId" TEXT,
  "lastInboundMessageId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConversationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tenant_phoneNumber_key" ON "Tenant"("phoneNumber");
CREATE UNIQUE INDEX "Tenant_whatsappPhoneNumberId_key" ON "Tenant"("whatsappPhoneNumberId");
CREATE UNIQUE INDEX "Tenant_whatsappVerifyToken_key" ON "Tenant"("whatsappVerifyToken");
CREATE INDEX "Tenant_businessType_idx" ON "Tenant"("businessType");
CREATE INDEX "Tenant_countryCode_idx" ON "Tenant"("countryCode");

CREATE UNIQUE INDEX "Service_tenantId_name_key" ON "Service"("tenantId", "name");
CREATE INDEX "Service_tenantId_active_idx" ON "Service"("tenantId", "active");

CREATE UNIQUE INDEX "Booking_calendarEventId_key" ON "Booking"("calendarEventId");
CREATE UNIQUE INDEX "Booking_tenantId_startAt_key" ON "Booking"("tenantId", "startAt");
CREATE INDEX "Booking_tenantId_status_idx" ON "Booking"("tenantId", "status");
CREATE INDEX "Booking_tenantId_customerPhone_idx" ON "Booking"("tenantId", "customerPhone");
CREATE INDEX "Booking_tenantId_startAt_endAt_idx" ON "Booking"("tenantId", "startAt", "endAt");

CREATE UNIQUE INDEX "ConversationState_tenantId_customerPhone_key" ON "ConversationState"("tenantId", "customerPhone");
CREATE UNIQUE INDEX "ConversationState_tenantId_lastInboundMessageId_key" ON "ConversationState"("tenantId", "lastInboundMessageId");
CREATE INDEX "ConversationState_tenantId_step_idx" ON "ConversationState"("tenantId", "step");
CREATE INDEX "ConversationState_tenantId_updatedAt_idx" ON "ConversationState"("tenantId", "updatedAt");

ALTER TABLE "Service"
ADD CONSTRAINT "Service_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConversationState"
ADD CONSTRAINT "ConversationState_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
