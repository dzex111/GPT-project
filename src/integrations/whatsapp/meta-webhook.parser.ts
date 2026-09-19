import { z } from "zod";
import { ValidationError } from "../../http/errors";

const webhookSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({
    changes: z.array(z.object({
      value: z.object({
        metadata: z.object({
          phone_number_id: z.string().min(1)
        }),
        messages: z.array(z.object({
          id: z.string().min(1),
          from: z.string().min(1),
          type: z.string(),
          text: z.object({
            body: z.string()
          }).optional(),
          contacts: z.array(z.object({
            profile: z.object({
              name: z.string().optional()
            }).optional()
          })).optional()
        })).optional()
      })
    }))
  }))
});

export type ParsedWebhook = {
  phoneNumberId: string;
  message?: {
    id: string;
    from: string;
    customerName?: string;
    text: string;
  };
};

export function parseMetaWebhook(input: unknown): ParsedWebhook[] {
  const parsed = webhookSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Invalid WhatsApp webhook payload");
  }

  return parsed.data.entry.flatMap(entry =>
    entry.changes.map(change => {
      const message = change.value.messages?.[0];

      if (!message?.text?.body) {
        return {
          phoneNumberId: change.value.metadata.phone_number_id
        };
      }

      return {
        phoneNumberId: change.value.metadata.phone_number_id,
        message: {
          id: message.id,
          from: message.from,
          customerName: message.contacts?.[0]?.profile?.name,
          text: message.text.body
        }
      };
    })
  );
}
