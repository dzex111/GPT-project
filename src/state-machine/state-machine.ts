import type { Tenant } from "@prisma/client";
import { ConversationRepository } from "../modules/conversations/conversation.repository";
import { ServiceRepository } from "../modules/services/service.repository";
import { BookingRepository } from "../modules/bookings/booking.repository";
import { PricingService } from "../services/pricing.service";
import { MetaWhatsAppService } from "../services/whatsapp.service";
import { GoogleCalendarService } from "../services/google-calendar.service";
import type { InboundWhatsAppMessage, StateMachineContext } from "./types";
import { handleServiceSelection } from "./handlers/service-selection.handler";
import { handleParameterCollection } from "./handlers/parameter-collection.handler";
import { handleQuoting } from "./handlers/quoting.handler";
import { handleSlotLookup } from "./handlers/slot-lookup.handler";
import { handleConfirmation } from "./handlers/confirmation.handler";

export class ConversationStateMachine {
  constructor(
    private readonly services = new ServiceRepository(),
    private readonly conversations = new ConversationRepository(),
    private readonly bookings = new BookingRepository(),
    private readonly pricing = new PricingService(),
    private readonly whatsapp = new MetaWhatsAppService(),
    private readonly calendar = new GoogleCalendarService()
  ) {}

  async handle(tenant: Tenant, message: InboundWhatsAppMessage) {
    let conversation = await this.conversations.findOrCreate(
      tenant.id,
      message.from,
      message.customerName
    );

    if (conversation.lastInboundMessageId === message.id) {
      return;
    }

    if (conversation.step === "BOOKED") {
      conversation = await this.conversations.updateOptimistic(
        conversation.id,
        conversation.version,
        {
          step: "SERVICE_SELECTION",
          serviceId: null,
          collectedParameters: {},
          quotedPriceMinor: null,
          selectedSlotStart: null,
          selectedSlotEnd: null,
          availableSlots: null,
          bookingId: null,
          lastInboundMessageId: null
        }
      );
    }

    const context = this.createContext(tenant, message, conversation);

    switch (conversation.step) {
      case "SERVICE_SELECTION":
        await handleServiceSelection(context);
        return;
      case "PARAMETER_COLLECTION":
        await handleParameterCollection(context);
        return;
      case "QUOTING":
        await handleQuoting(context);
        return;
      case "SLOT_LOOKUP":
        await handleSlotLookup(context);
        return;
      case "AWAITING_CONFIRMATION":
        await handleConfirmation(context);
        return;
    }
  }

  private createContext(
    tenant: Tenant,
    message: InboundWhatsAppMessage,
    conversation: Awaited<ReturnType<ConversationRepository["findOrCreate"]>>
  ): StateMachineContext {
    return {
      tenant,
      message,
      conversation,
      services: this.services,
      conversations: this.conversations,
      bookings: this.bookings,
      pricing: this.pricing,
      whatsapp: this.whatsapp,
      calendar: this.calendar
    };
  }
}
