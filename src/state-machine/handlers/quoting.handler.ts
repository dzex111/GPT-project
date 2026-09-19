import type { StateMachineContext } from "../types";

export async function handleQuoting(context: StateMachineContext) {
  if (!context.conversation.serviceId) {
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
      text: "The selected service is no longer available. Please choose another service."
    });
    return;
  }

  const parameters = isRecord(context.conversation.collectedParameters)
    ? context.conversation.collectedParameters
    : {};
  const priceMinor = context.pricing.calculatePrice(service, parameters);
  const slots = await context.calendar.findAvailableSlots(
    context.tenant,
    service.durationMinutes,
    5
  );

  const updated = await context.conversations.updateOptimistic(
    context.conversation.id,
    context.conversation.version,
    {
      step: slots.length === 0 ? "QUOTING" : "SLOT_LOOKUP",
      quotedPriceMinor: priceMinor,
      availableSlots: slots,
      lastInboundMessageId: context.message.id
    }
  );

  if (slots.length === 0) {
    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: `Estimated price: ${context.pricing.formatPrice(priceMinor, service.currency)}. No available appointment slots were found in the next 14 days.`
    });
    return updated;
  }

  const slotLines = slots
    .map((slot, index) => `${index + 1}. ${formatSlot(slot.start, context.tenant.timezone)}`)
    .join("\n");

  await context.whatsapp.sendText({
    tenant: context.tenant,
    recipientPhone: context.message.from,
    text: `Estimated price: ${context.pricing.formatPrice(priceMinor, service.currency)}.\nChoose an available slot:\n${slotLines}\nReply with the number of your choice.`
  });

  return updated;
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
