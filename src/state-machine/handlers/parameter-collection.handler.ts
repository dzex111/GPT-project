import type { StateMachineContext } from "../types";
import { handleQuoting } from "./quoting.handler";

export async function handleParameterCollection(context: StateMachineContext) {
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
      text: "The selected service is no longer available. Please choose a service again."
    });
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
    return;
  }

  const currentParameters = isRecord(context.conversation.collectedParameters)
    ? context.conversation.collectedParameters
    : {};
  const field = context.pricing.getMissingFields(service, currentParameters)[0];

  if (!field) {
    await handleQuoting(context);
    return;
  }

  let value: string;
  try {
    value = context.pricing.parseFieldValue(field, context.message.text);
  } catch {
    const options = field.options.map(option => option.label).join(" / ");
    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: `Invalid value for ${field.label}.${options ? ` Options: ${options}.` : ""}`
    });
    return;
  }

  const nextParameters = {
    ...currentParameters,
    [field.key]: value
  };

  const updated = await context.conversations.updateOptimistic(
    context.conversation.id,
    context.conversation.version,
    {
      step: "PARAMETER_COLLECTION",
      collectedParameters: nextParameters,
      lastInboundMessageId: context.message.id,
      customerName: context.message.customerName ?? context.conversation.customerName ?? null
    }
  );

  const nextField = context.pricing.getMissingFields(service, nextParameters)[0];

  if (nextField) {
    const options = nextField.options.map(option => option.label).join(" / ");
    await context.whatsapp.sendText({
      tenant: context.tenant,
      recipientPhone: context.message.from,
      text: `${nextField.label} is required. Please reply with ${options || "your answer"}.`
    });
    return;
  }

  await handleQuoting({
    ...context,
    conversation: updated
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
