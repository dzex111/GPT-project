# GCC WhatsApp Booking Engine

Multi-tenant WhatsApp booking and auto-quotation engine for local service businesses in Saudi Arabia and the UAE.

## Architecture

The codebase uses Express, TypeScript, Prisma, PostgreSQL, Meta WhatsApp Cloud API, Google Calendar, and a state-machine driven conversation layer.

## Directory layout

```text
src/
  config/
  controllers/
  http/
  integrations/
    whatsapp/
  modules/
    bookings/
    conversations/
    services/
    tenants/
  routes/
  services/
  state-machine/
    handlers/
  types/
prisma/
  schema.prisma
```

## Service parameters

Each service can define fields and pricing rules through the Service.parameters JSON field.

```json
{
  "fields": [
    {
      "key": "vehicleType",
      "label": "Vehicle type",
      "type": "select",
      "required": true,
      "options": [
        { "value": "sedan", "label": "Sedan" },
        { "value": "suv", "label": "SUV / 4x4" }
      ]
    }
  ],
  "pricingRules": [
    {
      "when": { "vehicleType": "suv" },
      "type": "flat",
      "amount": 2500
    },
    {
      "when": { "vehicleType": "sedan" },
      "type": "multiplier",
      "amount": 1.1
    }
  ]
}
```

Amounts are stored in minor currency units.

## Conversation flow

```text
SERVICE_SELECTION
  -> PARAMETER_COLLECTION
  -> QUOTING
  -> SLOT_LOOKUP
  -> AWAITING_CONFIRMATION
  -> BOOKED
```

## Business hours

Tenant.businessHours uses weekday keys where 0 is Sunday and 6 is Saturday.

```json
{
  "0": null,
  "1": { "open": "09:00", "close": "18:00" },
  "2": { "open": "09:00", "close": "18:00" },
  "3": { "open": "09:00", "close": "18:00" },
  "4": { "open": "09:00", "close": "18:00" },
  "5": { "open": "09:00", "close": "18:00" },
  "6": { "open": "10:00", "close": "16:00" }
}
```

## Local setup

```bash
npm install
copy .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run build
npm start
```

## HTTP endpoints

```text
GET  /health
GET  /webhooks/whatsapp
POST /webhooks/whatsapp
```

The WhatsApp webhook accepts Meta verification requests and signed inbound webhook payloads. Public webhook traffic is rate limited.

## Integrations

Meta WhatsApp Cloud API is used for inbound webhook processing and outbound text messages.

Google Calendar is used for free-busy slot lookup and event creation. Tenant configuration supplies the calendar id, service-account identity, private key, timezone, and working hours.
