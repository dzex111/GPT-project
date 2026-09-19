# GCC WhatsApp Booking Engine

Multi-tenant WhatsApp booking and auto-quotation engine for local service businesses in Saudi Arabia and the UAE.

## Stack

- Node.js 20+
- TypeScript
- Express 5
- Prisma
- PostgreSQL
- Meta WhatsApp Cloud API
- Google Calendar API
- Pino
- Zod
- JWT
- bcrypt

## Architecture

```text
src/
  config/
  controllers/
  http/
  integrations/
    whatsapp/
  modules/
    admin/
    auth/
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
.github/
  workflows/
    ci.yml
```

## Authentication

Authentication is based on signed JWT access tokens and rotating JWT refresh tokens.

Roles:

```text
SUPER_ADMIN
TENANT_ADMIN
```

A SUPER_ADMIN can operate on any tenant when a tenantId is supplied.

A TENANT_ADMIN is permanently scoped to the tenantId stored in the token. Cross-tenant access is rejected.

Login:

```text
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "your-password"
}
```

Refresh:

```text
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "..."
}
```

Access tokens are short-lived. Refresh tokens use a persisted session record with a SHA-256 token hash and single-use rotation.

Passwords are stored with bcrypt and never returned from APIs.

## Admin API

All admin endpoints require:

```text
Authorization: Bearer <access-token>
```

### Tenant

```text
POST  /api/v1/admin/tenants
GET   /api/v1/admin/tenants/:tenantId
PUT   /api/v1/admin/tenants/:tenantId
PATCH /api/v1/admin/tenants/settings
```

The settings endpoint manages business hours, booking buffer, auto-quote configuration, WhatsApp credentials, and administrative notification phone.

Sensitive credentials are accepted on write but are never serialized back to clients.

### Services

```text
GET    /api/v1/admin/services
POST   /api/v1/admin/services
PUT    /api/v1/admin/services/:serviceId
DELETE /api/v1/admin/services/:serviceId
```

Service deletion is a soft deactivation so historical bookings remain valid.

### Analytics

```text
GET /api/v1/admin/analytics
```

Supported query parameters:

```text
tenantId
from
to
```

The response contains:

- Revenue in minor currency units
- Booking totals and status breakdown
- Conversation funnel counts
- Quote rate
- Slot-stage rate
- Booking conversion rate
- Unique customers active in the last 30 days
- Unique customers in the selected reporting window

### Booking operations

```text
GET    /api/v1/admin/bookings
PUT    /api/v1/admin/bookings/:bookingId
DELETE /api/v1/admin/bookings/:bookingId
```

PUT supports status changes and manual rescheduling.

For confirmed bookings, rescheduling first checks Calendar availability and then patches the existing Google Calendar event.

DELETE performs cancellation and removes the Google Calendar event.

Customer WhatsApp notifications are sent on confirmation, rescheduling, cancellation, and completion operations.

## Internal API keys

Internal service-to-service calls can use the configured API key header:

```text
x-api-key: <internal-key>
```

The key is stored only as a SHA-256 hash in PostgreSQL.

Example protected endpoint:

```text
GET /api/v1/internal/ping
```

Tenant-scoped keys attach their tenant to the request context.

## Structured logging

Every request gets a correlation ID.

Clients may supply:

```text
x-correlation-id: <id>
```

or the server generates one.

The correlation ID is returned in:

```text
x-correlation-id
```

Pino emits structured JSON logs with service, environment, request method, path, correlation ID, status code, duration, and authenticated principal context.

Secrets and credentials are redacted.

## Error handling

All errors terminate through a centralized Express error handler.

Standard response shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed"
  },
  "correlationId": "..."
}
```

Handled categories include:

- Application errors
- Zod validation failures
- Prisma unique conflicts
- Prisma not-found errors
- Database validation errors
- Unhandled exceptions

Internal stacks are never returned to clients.

## HTTP hardening

- Helmet enabled
- CORS allowlist
- Authentication rate limiting
- Admin rate limiting
- WhatsApp webhook rate limiting
- Request body size limit
- Correlation IDs
- Graceful SIGINT and SIGTERM shutdown
- Prisma connection teardown
- Production environment validation

Production requires a non-empty CORS allowlist.

## Calendar

Google Calendar supports:

- Service Account JWT
- Per-tenant OAuth2 refresh tokens
- Environment-level OAuth2 fallback
- Free/busy queries
- Business hours
- Booking buffers
- Configurable slot intervals
- Booking horizon
- Event metadata
- Cancellation
- Rescheduling

A fresh Calendar availability check is performed before customer-side booking confirmation.

## Database

Phase 3 adds:

```text
User
RefreshSession
ApiKey
Tenant.autoQuoteParameters
```

Migration:

```text
prisma/migrations/20260919234000_phase3_auth/migration.sql
```

Deploy:

```bash
npx prisma migrate deploy
```

## Seed

```bash
npm run seed
```

The seed creates or updates a realistic Gulf Auto Detailing Center tenant and demo services.

Optional authentication seed variables:

```text
SEED_SUPER_ADMIN_EMAIL
SEED_SUPER_ADMIN_PASSWORD
SEED_TENANT_ADMIN_EMAIL
SEED_TENANT_ADMIN_PASSWORD
SEED_INTERNAL_API_KEY
```

Passwords and API keys should only be supplied through secure environment configuration.

## CI

GitHub Actions runs on main and pull requests:

```text
npm install
npx prisma validate
npx prisma generate
npm run build
```

## Required production configuration

```text
DATABASE_URL
ADMIN_JWT_SECRET
JWT_ISSUER
JWT_AUDIENCE
CORS_ORIGINS
META_GRAPH_API_VERSION
```

Never commit .env files or real WhatsApp, Google, JWT, password, or API-key secrets.
