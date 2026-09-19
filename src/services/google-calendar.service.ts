import { google, calendar_v3 } from "googleapis";
import { DateTime } from "luxon";
import { z } from "zod";
import { AppError } from "../http/errors";
import { env } from "../config/env";
import type { Tenant } from "@prisma/client";

const businessHoursSchema = z.record(
  z.string(),
  z.object({
    open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  }).nullable()
);

export type CalendarSlot = {
  start: string;
  end: string;
};

export type CalendarBookingInput = {
  tenant: Tenant;
  bookingId?: string;
  serviceId?: string;
  serviceName: string;
  customerName?: string;
  customerPhone: string;
  customerEmail?: string;
  parameters: Record<string, unknown>;
  startAt: Date;
  endAt: Date;
  priceMinor: number;
  currency: string;
};

export interface CalendarService {
  findAvailableSlots(tenant: Tenant, durationMinutes: number, limit?: number): Promise<CalendarSlot[]>;
  createBookingEvent(input: CalendarBookingInput): Promise<string>;
  cancelBookingEvent(tenant: Tenant, eventId: string): Promise<void>;
  deleteBookingEvent(tenant: Tenant, eventId: string): Promise<void>;
  rescheduleBookingEvent(
    tenant: Tenant,
    eventId: string,
    startAt: Date,
    endAt: Date
  ): Promise<void>;
}

export class GoogleCalendarService implements CalendarService {
  async findAvailableSlots(tenant: Tenant, durationMinutes: number, limit = 5) {
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new AppError(400, "INVALID_DURATION", "Service duration must be a positive integer");
    }

    const calendar = this.getCalendarClient(tenant);
    const now = DateTime.now().setZone(tenant.timezone);
    const horizon = now.plus({ days: env.CALENDAR_HORIZON_DAYS });
    const calendarId = this.getCalendarId(tenant);
    const timeMin = now.toUTC().toISO();
    const timeMax = horizon.toUTC().toISO();

    if (!timeMin || !timeMax) {
      throw new AppError(500, "CALENDAR_TIME_ERROR", "Unable to calculate calendar query range");
    }

    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: calendarId }]
      }
    });

    const bufferMs = tenant.bookingBufferMinutes * 60 * 1000;
    const busyIntervals = (freeBusy.data.calendars?.[calendarId]?.busy ?? [])
      .map(interval => ({
        start: DateTime.fromISO(String(interval.start), { zone: "utc" }).toMillis() - bufferMs,
        end: DateTime.fromISO(String(interval.end), { zone: "utc" }).toMillis() + bufferMs
      }))
      .filter(interval => Number.isFinite(interval.start) && Number.isFinite(interval.end));

    const businessHours = this.getBusinessHours(tenant);
    const slots: CalendarSlot[] = [];
    const slotIntervalMs = env.BOOKING_SLOT_INTERVAL_MINUTES * 60 * 1000;

    for (
      let dayOffset = 0;
      dayOffset <= env.CALENDAR_HORIZON_DAYS && slots.length < limit;
      dayOffset += 1
    ) {
      const day = now.startOf("day").plus({ days: dayOffset });
      const config = businessHours[String(day.weekday % 7)];

      if (!config) {
        continue;
      }

      const open = this.parseLocalTime(day, config.open);
      const close = this.parseLocalTime(day, config.close);
      let cursor = open;

      while (
        cursor.plus({ minutes: durationMinutes }).toMillis() <= close.toMillis() &&
        slots.length < limit
      ) {
        const slotStart = cursor.toUTC().toMillis();
        const slotEnd = cursor.plus({ minutes: durationMinutes }).toUTC().toMillis();
        const intersectsBusy = busyIntervals.some(interval =>
          slotStart < interval.end && slotEnd > interval.start
        );

        if (!intersectsBusy && cursor.toMillis() > now.toMillis()) {
          const start = cursor.toUTC().toISO();
          const end = cursor.plus({ minutes: durationMinutes }).toUTC().toISO();

          if (start && end) {
            slots.push({ start, end });
          }
        }

        cursor = DateTime.fromMillis(cursor.toMillis() + slotIntervalMs, {
          zone: tenant.timezone
        });
      }
    }

    return slots;
  }

  async createBookingEvent(input: CalendarBookingInput) {
    const calendar = this.getCalendarClient(input.tenant);
    const response = await calendar.events.insert({
      calendarId: this.getCalendarId(input.tenant),
      sendUpdates: "all",
      requestBody: {
        summary: `${input.serviceName} appointment`,
        description: JSON.stringify({
          customerName: input.customerName ?? null,
          customerPhone: input.customerPhone,
          parameters: input.parameters,
          priceMinor: input.priceMinor,
          currency: input.currency
        }),
        start: {
          dateTime: input.startAt.toISOString(),
          timeZone: input.tenant.timezone
        },
        end: {
          dateTime: input.endAt.toISOString(),
          timeZone: input.tenant.timezone
        },
        attendees: input.customerEmail ? [{ email: input.customerEmail }] : undefined,
        extendedProperties: {
          private: {
            bookingId: input.bookingId ?? "",
            tenantId: input.tenant.id,
            serviceId: input.serviceId ?? "",
            customerPhone: input.customerPhone,
            priceMinor: String(input.priceMinor),
            currency: input.currency
          }
        }
      }
    });

    if (!response.data.id) {
      throw new AppError(502, "CALENDAR_CREATE_FAILED", "Calendar booking creation failed");
    }

    return response.data.id;
  }

  async cancelBookingEvent(tenant: Tenant, eventId: string) {
    const calendar = this.getCalendarClient(tenant);

    try {
      await calendar.events.delete({
        calendarId: this.getCalendarId(tenant),
        eventId,
        sendUpdates: "all"
      });
    } catch (error) {
      if (this.isGoogleNotFound(error)) {
        return;
      }
      throw new AppError(502, "CALENDAR_CANCEL_FAILED", "Calendar cancellation failed");
    }
  }

  async deleteBookingEvent(tenant: Tenant, eventId: string) {
    await this.cancelBookingEvent(tenant, eventId);
  }

  async rescheduleBookingEvent(
    tenant: Tenant,
    eventId: string,
    startAt: Date,
    endAt: Date
  ) {
    const calendar = this.getCalendarClient(tenant);

    try {
      await calendar.events.patch({
        calendarId: this.getCalendarId(tenant),
        eventId,
        sendUpdates: "all",
        requestBody: {
          start: {
            dateTime: startAt.toISOString(),
            timeZone: tenant.timezone
          },
          end: {
            dateTime: endAt.toISOString(),
            timeZone: tenant.timezone
          }
        }
      });
    } catch {
      throw new AppError(502, "CALENDAR_RESCHEDULE_FAILED", "Calendar rescheduling failed");
    }
  }

  private getCalendarClient(tenant: Tenant) {
    if (
      tenant.googleServiceAccountEmail &&
      tenant.googleServiceAccountPrivateKey
    ) {
      const auth = new google.auth.JWT({
        email: tenant.googleServiceAccountEmail,
        key: tenant.googleServiceAccountPrivateKey.replace(/\\n/g, "\n"),
        scopes: ["https://www.googleapis.com/auth/calendar"]
      });

      return google.calendar({
        version: "v3",
        auth
      });
    }

    if (
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      env.GOOGLE_PRIVATE_KEY
    ) {
      const auth = new google.auth.JWT({
        email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        scopes: ["https://www.googleapis.com/auth/calendar"]
      });

      return google.calendar({
        version: "v3",
        auth
      });
    }

    if (
      tenant.googleOAuthClientId &&
      tenant.googleOAuthClientSecret &&
      tenant.googleOAuthRefreshToken
    ) {
      const auth = new google.auth.OAuth2(
        tenant.googleOAuthClientId,
        tenant.googleOAuthClientSecret
      );

      auth.setCredentials({
        refresh_token: tenant.googleOAuthRefreshToken
      });

      return google.calendar({
        version: "v3",
        auth
      });
    }

    if (
      env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REFRESH_TOKEN
    ) {
      const auth = new google.auth.OAuth2(
        env.GOOGLE_OAUTH_CLIENT_ID,
        env.GOOGLE_OAUTH_CLIENT_SECRET
      );

      auth.setCredentials({
        refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN
      });

      return google.calendar({
        version: "v3",
        auth
      });
    }

    throw new AppError(500, "CALENDAR_CONFIGURATION_ERROR", "Google Calendar is not configured");
  }

  private getCalendarId(tenant: Tenant) {
    if (!tenant.googleCalendarId) {
      throw new AppError(500, "CALENDAR_CONFIGURATION_ERROR", "Google Calendar id is not configured");
    }

    return tenant.googleCalendarId;
  }

  private getBusinessHours(tenant: Tenant) {
    const parsed = businessHoursSchema.safeParse(tenant.businessHours ?? {});

    if (!parsed.success) {
      throw new AppError(500, "BUSINESS_HOURS_CONFIGURATION_ERROR", "Business hours configuration is invalid");
    }

    return parsed.data;
  }

  private parseLocalTime(day: DateTime, value: string) {
    const [hour, minute] = value.split(":").map(Number);

    return day.set({
      hour,
      minute,
      second: 0,
      millisecond: 0
    });
  }

  private isGoogleNotFound(error: unknown) {
    if (!error || typeof error !== "object") {
      return false;
    }

    const candidate = error as { code?: unknown; response?: { status?: unknown } };
    return candidate.code === 404 || candidate.response?.status === 404;
  }
}
