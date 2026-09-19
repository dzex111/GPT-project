import { Prisma } from "@prisma/client";
import type { StateMachineContext } from "../types";

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

  const parameters = isRecord(context.conversation.collectedParameters)
    ? context.conversation.collectedParameters
    : {};

  const eventId = await context.calendar.createBookingEvent({
    tenant: context.tenant,
    serviceName: service.name,
    customerName: context.conversation.customerName ?? context.message.customerName,
    customerPhone: context.message.from,
    parameters,
    startAt: context.conversation.selectedSlotStart,
    endAt: context.conversation.selectedSlotEnd,
    priceMinor: context.conversation.quotedPriceMinor,
    currency: service.currency
  });

  try {
    const booking = await context.bookings.create({
      tenantId: context.tenant.id,
      serviceId: service.id,
      customerPhone: context.message.from,
      customerName: context.conversation.customerName ?? context.message.customerName,
      customerParameters: parameters as Prisma.InputJsonValue,
      status: "CONFIRMED",
      calendarEventId: eventId,
      startAt: context.conversation.selectedSlotStart,
      endAt: context.conversation.selectedSlotEnd,
      priceMinor: context.conversation.quotedPriceMinor,
      currency: service.currency
    });

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
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
