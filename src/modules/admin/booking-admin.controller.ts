import type { Request, Response } from "express";
import type { BookingStatus } from "@prisma/client";
import { asyncHandler } from "../../http/async-handler";
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from "../../http/errors";
import { BookingRepository } from "../bookings/booking.repository";
import { GoogleCalendarService } from "../../services/google-calendar.service";
import { bookingStatusSchema } from "./admin.schemas";
import { resolveTenantId } from "./admin-scope";

const bookings = new BookingRepository();
const calendar = new GoogleCalendarService();

export const listBookings = asyncHandler(async (request: Request, response: Response) => {
  const tenantId = resolveTenantId(request, asOptionalString(request.query.tenantId));
  const status = parseStatus(request.query.status);
  const from = parseDate(request.query.from, "from");
  const to = parseDate(request.query.to, "to");
  const limit = parsePositiveInteger(request.query.limit, 50, 100);
  const offset = parseNonNegativeInteger(request.query.offset, 0, 10000);

  const result = await bookings.listForTenant(tenantId, {
    status,
    from,
    to,
    limit,
    offset
  });

  response.json({
    data: result,
    pagination: {
      limit,
      offset,
      returned: result.length
    }
  });
});

export const cancelBooking = asyncHandler(async (request: Request, response: Response) => {
  const booking = await bookings.findById(request.params.bookingId);

  if (!booking) {
    throw new NotFoundError("Booking not found");
  }

  const tenantId = resolveTenantId(request, booking.tenantId);

  if (tenantId !== booking.tenantId) {
    throw new NotFoundError("Booking not found");
  }

  if (booking.status === "CANCELLED") {
    response.json({ data: booking });
    return;
  }

  if (booking.status === "COMPLETED") {
    throw new ConflictError("Completed bookings cannot be cancelled");
  }

  if (booking.calendarEventId) {
    await calendar.cancelBookingEvent(booking.tenant, booking.calendarEventId);
  }

  const cancelled = await bookings.cancelForTenant(tenantId, booking.id);

  if (!cancelled) {
    const current = await bookings.findByIdForTenant(tenantId, booking.id);

    if (current?.status === "CANCELLED") {
      response.json({ data: current });
      return;
    }

    throw new ConflictError("Booking cancellation could not be completed");
  }

  response.json({
    data: cancelled
  });
});

function parseStatus(value: unknown): BookingStatus | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const parsed = bookingStatusSchema.safeParse(value);

  if (!parsed.success) {
    throw new ValidationError("Invalid booking status");
  }

  return parsed.data;
}

function parseDate(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Invalid ${field} date`);
  }

  return date;
}

function parsePositiveInteger(value: unknown, fallback: number, max: number) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new ValidationError("Invalid limit");
  }

  return parsed;
}

function parseNonNegativeInteger(value: unknown, fallback: number, max: number) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    throw new ValidationError("Invalid offset");
  }

  return parsed;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
