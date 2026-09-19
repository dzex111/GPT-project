import type { Request, Response } from "express";
import { TenantRepository } from "../modules/tenants/tenant.repository";
import { ConversationStateMachine } from "../state-machine/state-machine";
import { parseMetaWebhook } from "../integrations/whatsapp/meta-webhook.parser";
import { verifyMetaSignature } from "../integrations/whatsapp/meta-signature";
import { UnauthorizedError, ValidationError } from "../http/errors";

const tenants = new TenantRepository();
const machine = new ConversationStateMachine();

export async function verifyWebhook(request: Request, response: Response) {
  const mode = String(request.query["hub.mode"] ?? "");
  const token = String(request.query["hub.verify_token"] ?? "");
  const challenge = String(request.query["hub.challenge"] ?? "");

  if (mode !== "subscribe" || !token || !challenge) {
    throw new ValidationError("Invalid verification request");
  }

  const tenant = await tenants.findByVerifyToken(token);

  if (!tenant) {
    throw new UnauthorizedError();
  }

  response.type("text/plain").send(challenge);
}

export async function receiveWebhook(request: Request, response: Response) {
  if (!request.rawBody) {
    throw new ValidationError("Raw request body is unavailable");
  }

  const events = parseMetaWebhook(request.body);
  const signature = request.header("x-hub-signature-256");

  for (const event of events) {
    const tenant = await tenants.findByWhatsAppPhoneNumberId(event.phoneNumberId);

    if (!tenant || !tenant.whatsappAppSecret) {
      throw new UnauthorizedError();
    }

    if (!verifyMetaSignature(request.rawBody, signature, tenant.whatsappAppSecret)) {
      throw new UnauthorizedError();
    }

    if (event.message) {
      await machine.handle(tenant, event.message);
    }
  }

  response.sendStatus(200);
}
