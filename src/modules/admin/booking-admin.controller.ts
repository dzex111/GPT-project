import type { Request, Response } from "express";
import type { BookingStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { asyncHandler } from "../../http/async-handler";
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from "../../http/errors";
import { BookingRepository } from "../bookings/booking.repository";
import { GoogleCalendarService } from "../../services/google-calendar.service";
import { MetaWhatsAppService } from "../../services/whatsapp.service";
import {
  bookingStatusSchema,
  updateBookingSchema
} from "./admin.schemas";
import { resolveTenantId } from "./admin-scope";

const bookings = new BookingRepository();
const calendar = new GoogleCalendarService();
const whatsapp = new MetaWhatsAppService();

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

export const updateBooking = asyncHandler(async (request: Request, response: Response) => {
  const parsed = updateBookingSchema.safeParse(request.body);

  if (!parsed.success) {
    throw new ValidationError(parsed.error.message);
  }

  const tenantId = resolveTenantId(request, asOptionalString(request.query.tenantId));
  const bookingId = asRequiredString(request.params.bookingId, "bookingId");
  const booking = await bookings.findByIdForTenant(tenantId, bookingId);

  if (!booking) {
    throw new NotFoundError("Booking not found");
  }

  if (
    booking.status === "CANCELLED" &&
    (parsed.data.status !== undefined || parsed.data.startAt !== undefined)
  ) {
    throw new ConflictError("Cancelled bookings cannot be modified");
  }

  if (
    booking.status === "COMPLETED" &&
    (parsed.data.status !== undefined || parsed.data.startAt !== undefined)
  ) {
    throw new ConflictError("Completed bookings cannot be modified");
  }

  let current = booking;

  if (parsed.data.startAt && parsed.data.endAt) {
    const startAt = new Date(parsed.data.startAt);
    const endAt = new Date(parsed.data.endAt);

    if (booking.status === "PENDING" && !booking.calendarEventId) {
      current = await updateSchedule(current, startAt, endAt, tenantId);
    } else {
      const slotAvailable = await isSlotAvailable(booking, startAt, endAt);

      if (!slotAvailable) {
        throw new ConflictError("The requested booking slot is unavailable");
      }

      if (booking.calendarEventId && booking.status === "CONFIRMED") {
        await calendar.rescheduleBookingEvent(
          booking.tenant,
          booking.calendarEventId,
          startAt,
          endAt
        );

        try {
          current = await updateSchedule(current, startAt, endAt, tenantId);
        } catch (error) {
          await calendar.rescheduleBookingEvent(
            booking.tenant,
            booking.calendarEventId,
            booking.startAt,
            booking.endAt
          );
          throw error;
        }
      } else {
        current = await updateSchedule(current, startAt, endAt, tenantId);
      }
    }

    await notifyCustomer(
      current,
      `Your booking has been rescheduled to ${formatDate(current.startAt, current.tenant.timezone)}.`
    );
  }

  if (parsed.data.status !== undefined && parsed.data.status !== current.status) {
    current = await applyStatusChange(tenantId, current, parsed.data.status);
  }

  response.json({
    data: current
  });
});

export const cancelBooking = asyncHandler(async (request: Request, response: Response) => {
  const tenantId = resolveTenantId(request, asOptionalString(request.query.tenantId));
  const bookingId = asRequiredString(request.params.bookingId, "bookingId");
  const booking = await bookings.findByIdForTenant(tenantId, bookingId);

  if (!booking) {
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

  await notifyCustomer(
    booking,
    "Your booking has been cancelled by the business."
  );

  response.json({
    data: cancelled
  });
});

async function updateSchedule(
  booking: NonNullable<Awaited<ReturnType<BookingRepository["findByIdForTenant"]>>>,
  startAt: Date,
  endAt: Date,
  tenantId: string
) {
  try {
    const updated = await bookings.updateScheduleForTenant(
      tenantId,
      booking.id,
      startAt,
      endAt
    );

    if (!updated) {
      throw new ConflictError("Booking could not be rescheduled");
    }

    return {
      ...booking,
      ...updated
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("The requested booking slot is already occupied");
    }

    throw error;
  }
}

async function applyStatusChange(
  tenantId: string,
  booking: NonNullable<Awaited<ReturnType<BookingRepository["findByIdForTenant"]>>>,
  nextStatus: BookingStatus
) {
  if (nextStatus === "CANCELLED") {
    if (booking.calendarEventId) {
      await calendar.cancelBookingEvent(booking.tenant, booking.calendarEventId);
    }

    const cancelled = await bookings.cancelForTenant(tenantId, booking.id);

    if (!cancelled) {
      throw new ConflictError("Booking cancellation could not be completed");
    }

    await notifyCustomer(
      booking,
      "Your booking has been cancelled by the business."
    );

    return {
      ...booking,
      ...cancelled
    };
  }

  if (nextStatus === "CONFIRMED" && booking.status === "PENDING") {
    const slotAvailable = await isSlotAvailable(
      booking,
      booking.startAt,
      booking.endAt
    );

    if (!slotAvailable) {
      throw new ConflictError("The pending booking slot is no longer available");
    }

    const eventId = await calendar.createBookingEvent({
      tenant: booking.tenant,
      bookingId: booking.id,
      serviceId: booking.service.id,
      serviceName: booking.service.name,
      customerName: booking.customerName ?? undefined,
      customerPhone: booking.customerPhone,
      customerEmail: booking.customerEmail ?? undefined,
      parameters: toRecord(booking.customerParameters),
      startAt: booking.startAt,
      endAt: booking.endAt,
      priceMinor: booking.priceMinor,
      currency: booking.currency
    });

    try {
      const confirmed = await bookings.confirmForTenant(
        tenantId,
        booking.id,
        eventId
      );

      await notifyCustomer(
        booking,
        "Your booking has been confirmed by the business."
      );

      return {
        ...booking,
        ...confirmed
      };
    } catch (error) {
      await calendar.deleteBookingEvent(booking.tenant, eventId);
      throw error;
    }
  }

  if (nextStatus === "PENDING" && booking.status !== "PENDING") {
    throw new ConflictError("Confirmed or completed bookings cannot be moved back to pending");
  }

  const updated = await bookings.updateStatusForTenant(
    tenantId,
    booking.id,
    nextStatus
  );

  if (!updated) {
    throw new ConflictError("Booking status could not be updated");
  }

  if (nextStatus === "COMPLETED") {
    await notifyCustomer(
      booking,
      "Your booking has been marked as completed."
    );
  }

  return {
    ...booking,
    ...updated
  };
}

async function isSlotAvailable(
  booking: NonNullable<Awaited<ReturnType<BookingRepository["findByIdForTenant"]>>>,
  startAt: Date,
  endAt: Date
) {
  const slots = await calendar.findAvailableSlots(
    booking.tenant,
    booking.service.durationMinutes,
    100
  );

  const start = startAt.toISOString();
  const end = endAt.toISOString();

  return slots.some(slot => slot.start === start && slot.end === end) ||
    (
      booking.calendarEventId !== null &&
      startAt.getTime() === booking.startAt.getTime() &&
      endAt.getTime() === booking.endAt.getTime()
    );
}

async function notifyCustomer(
  booking: NonNullable<Awaited<ReturnType<BookingRepository["findByIdForTenant"]>>>,
  text: string
) {
  await whatsapp.sendText({
    tenant: booking.tenant,
    recipientPhone: booking.customerPhone,
    text
  });
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function formatDate(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

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

function asRequiredString(value: unknown, field: string) {
  const result = asOptionalString(value);

  if (!result) {
    throw new ValidationError(`Invalid ${field}`);
  }

  return result;
}
