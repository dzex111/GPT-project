import type { StateMachineContext } from "../types";

export async function handleSlotLookup(context: StateMachineContext) {
  const slots = Array.isArray(context.conversation.availableSlots)
    ? context.conversation.availableSlots as Array<{ start: string; end: string }>
    : [];
  const index = Number(context.message.text.trim()) - 1;

  if (!Number.isInteger(index) || index < 0 || index >= slots.length) {
    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: `Choose a slot number from 1 to ${slots.length}.`
    });
    return;
  }

  const slot = slots[index];
  const updated = await context.conversations.updateOptimistic(
    context.conversation.id,
    context.conversation.version,
    {
      step: "AWAITING_CONFIRMATION",
      selectedSlotStart: new Date(slot.start),
      selectedSlotEnd: new Date(slot.end),
      lastInboundMessageId: context.message.id,
      customerName: context.message.customerName ?? context.conversation.customerName ?? null
    }
  );

  const service = context.conversation.serviceId
    ? await context.services.findByIdForTenant(context.tenant.id, context.conversation.serviceId)
    : null;

  const price = context.conversation.quotedPriceMinor === null
    ? "Calculated at booking"
    : context.pricing.formatPrice(context.conversation.quotedPriceMinor, service?.currency ?? context.tenant.currency);

  await context.whatsapp.sendText({
    tenant: context.tenant,
    recipientPhone: context.message.from,
    text: `Please confirm.\nService: ${service?.name ?? "Selected service"}\nPrice: ${price}\nTime: ${formatSlot(slot.start, context.tenant.timezone)}\nReply YES to confirm or NO to cancel.`
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
