import { google } from "googleapis";
import { DateTime } from "luxon";
import { z } from "zod";
import { AppError } from "../http/errors";
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

export interface CalendarService {
  findAvailableSlots(tenant: Tenant, durationMinutes: number, limit?: number): Promise<CalendarSlot[]>;
  createBookingEvent(input: {
    tenant: Tenant;
    serviceName: string;
    customerName?: string;
    customerPhone: string;
    customerEmail?: string;
    parameters: Record<string, unknown>;
    startAt: Date;
    endAt: Date;
    priceMinor: number;
    currency: string;
  }): Promise<string>;
  deleteBookingEvent(tenant: Tenant, eventId: string): Promise<void>;
}

export class GoogleCalendarService implements CalendarService {
  async findAvailableSlots(tenant: Tenant, durationMinutes: number, limit = 5) {
    const calendar = this.getCalendarClient(tenant);
    const now = DateTime.now().setZone(tenant.timezone);
    const horizon = now.plus({ days: 14 });
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

    const busyIntervals = (freeBusy.data.calendars?.[calendarId]?.busy ?? [])
      .map(interval => ({
        start: DateTime.fromISO(String(interval.start), { zone: "utc" }).toMillis(),
        end: DateTime.fromISO(String(interval.end), { zone: "utc" }).toMillis()
      }))
      .filter(interval => Number.isFinite(interval.start) && Number.isFinite(interval.end));

    const businessHours = this.getBusinessHours(tenant);
    const slots: CalendarSlot[] = [];

    for (let dayOffset = 0; dayOffset < 14 && slots.length < limit; dayOffset += 1) {
      const day = now.startOf("day").plus({ days: dayOffset });
      const config = businessHours[String(day.weekday % 7)];

      if (!config) {
        continue;
      }

      const open = this.parseLocalTime(day, config.open);
      const close = this.parseLocalTime(day, config.close);
      let cursor = open;

      while (cursor.plus({ minutes: durationMinutes }) <= close && slots.length < limit) {
        const slotStart = cursor.toUTC().toMillis();
        const slotEnd = cursor.plus({ minutes: durationMinutes }).toUTC().toMillis();
        const intersectsBusy = busyIntervals.some(interval =>
          slotStart < interval.end && slotEnd > interval.start
        );

        if (!intersectsBusy && cursor > now) {
          const start = cursor.toUTC().toISO();
          const end = cursor.plus({ minutes: durationMinutes }).toUTC().toISO();

          if (start && end) {
            slots.push({ start, end });
          }
        }

        cursor = cursor.plus({ minutes: 30 });
      }
    }

    return slots;
  }

  async createBookingEvent(input: {
    tenant: Tenant;
    serviceName: string;
    customerName?: string;
    customerPhone: string;
    customerEmail?: string;
    parameters: Record<string, unknown>;
    startAt: Date;
    endAt: Date;
    priceMinor: number;
    currency: string;
  }) {
    const calendar = this.getCalendarClient(input.tenant);
    const response = await calendar.events.insert({
      calendarId: this.getCalendarId(input.tenant),
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
        attendees: input.customerEmail ? [{ email: input.customerEmail }] : undefined
      }
    });

    if (!response.data.id) {
      throw new AppError(502, "CALENDAR_CREATE_FAILED", "Calendar booking creation failed");
    }

    return response.data.id;
  }

  async deleteBookingEvent(tenant: Tenant, eventId: string) {
    const calendar = this.getCalendarClient(tenant);
    await calendar.events.delete({
      calendarId: this.getCalendarId(tenant),
      eventId
    });
  }

  private getCalendarClient(tenant: Tenant) {
    if (!tenant.googleServiceAccountEmail || !tenant.googleServiceAccountPrivateKey || !tenant.googleCalendarId) {
      throw new AppError(500, "CALENDAR_CONFIGURATION_ERROR", "Google Calendar is not configured");
    }

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

  private getCalendarId(tenant: Tenant) {
    if (!tenant.googleCalendarId) {
      throw new AppError(500, "CALENDAR_CONFIGURATION_ERROR", "Google Calendar is not configured");
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
}
