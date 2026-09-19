import { Prisma } from "@prisma/client";
import type { StateMachineContext } from "../types";
import { ConflictError } from "../../http/errors";

export async function handleConfirmation(context: StateMachineContext) {
  const answer = context.message.text.trim().toLowerCase();

  if (answer === "no" || answer === "n" || answer === "cancel") {
    await context.conversations.updateOptimistic(
      context.conversation.id,
      context.conversation.version,
      {
        step: "SERVICE_SELECTION",
        serviceId: null,
        collectedParameters: {},
        quotedPriceMinor: null,
        selectedSlotStart: null,
        selectedSlotEnd: null,
        availableSlots: null,
        bookingId: null,
        lastInboundMessageId: context.message.id
      }
    );

    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: "Booking cancelled. Reply with the service you need to start again."
    });
    return;
  }

  if (answer !== "yes" && answer !== "y" && answer !== "confirm") {
    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: "Reply YES to confirm the booking or NO to cancel."
    });
    return;
  }

  if (
    !context.conversation.serviceId ||
    !context.conversation.selectedSlotStart ||
    !context.conversation.selectedSlotEnd ||
    context.conversation.quotedPriceMinor === null
  ) {
    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: "The booking details are incomplete. Please start again by selecting a service."
    });
    return;
  }

  const service = await context.services.findByIdForTenant(
    context.tenant.id,
    context.conversation.serviceId
  );

  if (!service) {
    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: "The selected service is no longer available."
    });
    return;
  }

  const latestSlots = await context.calendar.findAvailableSlots(
    context.tenant,
    service.durationMinutes,
    20
  );
  const selectedStart = context.conversation.selectedSlotStart.toISOString();
  const selectedEnd = context.conversation.selectedSlotEnd.toISOString();
  const stillAvailable = latestSlots.some(slot =>
    slot.start === selectedStart && slot.end === selectedEnd
  );

  if (!stillAvailable) {
    const refreshed = await context.conversations.updateOptimistic(
      context.conversation.id,
      context.conversation.version,
      {
        step: "SLOT_LOOKUP",
        availableSlots: latestSlots,
        selectedSlotStart: null,
        selectedSlotEnd: null,
        lastInboundMessageId: context.message.id
      }
    );

    const slotLines = latestSlots
      .slice(0, 5)
      .map((slot, index) => `${index + 1}. ${formatSlot(slot.start, context.tenant.timezone)}`)
      .join("\n");

    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: slotLines
        ? `That slot is no longer available. Please choose another:\n${slotLines}`
        : "That slot is no longer available and no replacement slots were found."
    });

    return refreshed;
  }

  const parameters = isRecord(context.conversation.collectedParameters)
    ? context.conversation.collectedParameters
    : {};

  let booking = await context.bookings.create({
    tenantId: context.tenant.id,
    serviceId: service.id,
    customerPhone: context.message.from,
    customerName: context.conversation.customerName ?? context.message.customerName,
    customerParameters: parameters as Prisma.InputJsonValue,
    status: "PENDING",
    calendarEventId: null,
    startAt: context.conversation.selectedSlotStart,
    endAt: context.conversation.selectedSlotEnd,
    priceMinor: context.conversation.quotedPriceMinor,
    currency: service.currency
  });

  let eventId: string;

  try {
    eventId = await context.calendar.createBookingEvent({
      tenant: context.tenant,
      bookingId: booking.id,
      serviceId: service.id,
      serviceName: service.name,
      customerName: context.conversation.customerName ?? context.message.customerName,
      customerPhone: context.message.from,
      parameters,
      startAt: context.conversation.selectedSlotStart,
      endAt: context.conversation.selectedSlotEnd,
      priceMinor: context.conversation.quotedPriceMinor,
      currency: service.currency
    });
  } catch (error) {
    await context.bookings.deleteForTenant(context.tenant.id, booking.id);
    throw error;
  }

  try {
    booking = await context.bookings.confirmForTenant(
      context.tenant.id,
      booking.id,
      eventId
    );

    await context.conversations.updateOptimistic(
      context.conversation.id,
      context.conversation.version,
      {
        step: "BOOKED",
        bookingId: booking.id,
        lastInboundMessageId: context.message.id
      }
    );

    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: context.tenant.timezone,
      dateStyle: "medium",
      timeStyle: "short"
    }).format(context.conversation.selectedSlotStart);

    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: `Booking confirmed for ${service.name} on ${time}. Reference: ${booking.id}.`
    });

    if (context.tenant.adminNotificationPhone) {
      await context.whatsapp.sendText({
        tenant: context.tenant,
        recipientPhone: context.tenant.adminNotificationPhone,
        text: `New booking: ${service.name}. Customer: ${context.conversation.customerName ?? context.message.customerName ?? context.message.from}. Price: ${context.pricing.formatPrice(context.conversation.quotedPriceMinor, service.currency)}. Booking: ${booking.id}.`
      });
    }
  } catch (error) {
    await context.calendar.deleteBookingEvent(context.tenant, eventId);
    await context.bookings.deleteForTenant(context.tenant.id, booking.id);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("The selected time was booked by another customer");
    }

    throw error;
  }
}

function formatSlot(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
