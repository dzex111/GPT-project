import type { Service } from "@prisma/client";
import type { StateMachineContext } from "../types";

export async function handleServiceSelection(context: StateMachineContext) {
  const services = await context.services.listActive(context.tenant.id);

  if (services.length === 0) {
    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: "No services are currently available. Please contact the business directly."
    });
    return;
  }

  const matched = services.find(service =>
    normalize(context.message.text).includes(normalize(service.name))
  ) ?? null;

  if (!matched) {
    const names = services.map(service => service.name).join(", ");
    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: `Available services: ${names}. Reply with the service you need.`
    });
    return;
  }

  const definition = context.pricing.getDefinition(matched);
  const firstRequiredField = definition.fields.find(field => field.required);

  const updated = await context.conversations.updateOptimistic(
    context.conversation.id,
    context.conversation.version,
    {
      step: firstRequiredField ? "PARAMETER_COLLECTION" : "QUOTING",
      serviceId: matched.id,
      collectedParameters: {},
      quotedPriceMinor: null,
      selectedSlotStart: null,
      selectedSlotEnd: null,
      availableSlots: null,
      bookingId: null,
      lastInboundMessageId: context.message.id,
      customerName: context.message.customerName ?? context.conversation.customerName ?? null
    }
  );

  if (firstRequiredField) {
    const options = firstRequiredField.options.map(option => option.label).join(" / ");
    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: `${firstRequiredField.label} is required. Please reply with ${options || "your answer"}.`
    });
  }

  return updated;
}

function normalize(value: string) {
  return value.toLowerCase().trim();
}
