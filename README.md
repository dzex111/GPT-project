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
    admin/
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
  migrations/
  schema.prisma
  seed.ts
```

## Conversation flow

```text
SERVICE_SELECTION
  -> PARAMETER_COLLECTION
  -> QUOTING
  -> SLOT_LOOKUP
  -> AWAITING_CONFIRMATION
  -> BOOKED
```

## Dynamic pricing

Each service stores fields and pricing rules in Service.parameters.

Amounts use integer minor currency units.

## Calendar integration

Google Calendar authentication supports:

- Per-tenant service account JWT credentials
- Per-tenant OAuth2 refresh token credentials
- Optional environment-level OAuth2 fallback

The calendar service queries Google free/busy data, applies tenant business hours, expands busy intervals by booking buffer time, and returns bookable slots.

Confirmed bookings create Calendar events with customer data plus private metadata containing tenant, booking, service, customer phone, price, and currency identifiers.

Calendar lifecycle methods support event creation, cancellation, deletion, and rescheduling.

Before final booking confirmation, the selected slot is checked against fresh free/busy data to reduce stale-slot collisions.

## Business hours

Tenant.businessHours uses weekday keys where 0 is Sunday and 6 is Saturday.

```json
{
  "0": null,
  "1": { "open": "09:00", "close": "19:00" },
  "2": { "open": "09:00", "close": "19:00" },
  "3": { "open": "09:00", "close": "19:00" },
  "4": { "open": "09:00", "close": "19:00" },
  "5": { "open": "14:00", "close": "19:00" },
  "6": { "open": "10:00", "close": "16:00" }
}
```

Tenant.bookingBufferMinutes defines the time buffer applied around existing Calendar busy intervals.

## Automated seed

Run:

```bash
npm install
npm run seed
```

The seed creates or updates a demo Gulf Auto Detailing Center tenant and realistic demo services. Seed updates preserve existing Google and WhatsApp secrets unless explicit seed environment values are supplied.

Prisma is configured with an idempotent seed command in package.json.

## Database migrations

A deployable baseline migration is stored in:

```text
prisma/migrations/20260919230000_init/migration.sql
```

Run locally:

```bash
npx prisma migrate dev
```

Run in production:

```bash
npx prisma migrate deploy
```

## Admin API

All admin routes require an HTTP Bearer JWT signed with ADMIN_JWT_SECRET and a JWT claim:

```json
{
  "role": "admin"
}
```

A tenant-scoped token may additionally include:

```json
{
  "role": "admin",
  "tenantId": "tenant-cuid"
}
```

Tenant-scoped tokens cannot access another tenant.

### Tenant management

```text
POST /api/v1/admin/tenants
GET  /api/v1/admin/tenants/:tenantId
PUT  /api/v1/admin/tenants/:tenantId
```

Tenant credentials are accepted by the write endpoints but never returned by the API.

### Service management

```text
GET    /api/v1/admin/services?tenantId=:tenantId
POST   /api/v1/admin/services
PUT    /api/v1/admin/services/:serviceId?tenantId=:tenantId
DELETE /api/v1/admin/services/:serviceId?tenantId=:tenantId
```

DELETE deactivates a service rather than physically removing historical service references.

### Booking management

```text
GET  /api/v1/admin/bookings?tenantId=:tenantId
POST /api/v1/admin/bookings/:bookingId/cancel
```

Booking queries support status, from, to, limit, and offset filters.

Cancellation removes the Google Calendar event before atomically transitioning the booking from PENDING or CONFIRMED to CANCELLED.

## Health

```text
GET /health
```

The health endpoint checks PostgreSQL with a lightweight query and returns HTTP 503 when the database is unavailable.

## Environment

Copy .env.example to .env and provide:

```text
DATABASE_URL
ADMIN_JWT_SECRET
META_GRAPH_API_VERSION
```

Google OAuth variables are optional and must be supplied as a complete set when used.

Tenant-specific Google and WhatsApp credentials are managed through the admin API or seed environment variables.
