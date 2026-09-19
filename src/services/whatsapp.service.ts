import { env } from "../config/env";
import { AppError } from "../http/errors";
import type { Tenant } from "@prisma/client";

type SendTextInput = {
  tenant: Tenant;
  recipientPhone: string;
  text: string;
};

export class MetaWhatsAppService {
  async sendText(input: SendTextInput) {
    if (!input.tenant.whatsappAccessToken) {
      throw new AppError(500, "WHATSAPP_CONFIGURATION_ERROR", "WhatsApp access is not configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.OUTBOUND_HTTP_TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${input.tenant.whatsappPhoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.tenant.whatsappAccessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: input.recipientPhone,
            type: "text",
            text: {
              preview_url: false,
              body: input.text
            }
          }),
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new AppError(502, "WHATSAPP_SEND_FAILED", "WhatsApp message delivery failed");
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
