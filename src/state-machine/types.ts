import type { BookingRepository } from "../modules/bookings/booking.repository";
import type { ConversationRepository } from "../modules/conversations/conversation.repository";
import type { ServiceRepository } from "../modules/services/service.repository";
import type { PricingService } from "../services/pricing.service";
import type { MetaWhatsAppService } from "../services/whatsapp.service";
import type { CalendarService } from "../services/google-calendar.service";
import type { Tenant, ConversationState } from "@prisma/client";

export type InboundWhatsAppMessage = {
  id: string;
  from: string;
  customerName?: string;
  text: string;
};

export type StateMachineContext = {
  tenant: Tenant;
  message: InboundWhatsAppMessage;
  conversation: ConversationState;
  services: ServiceRepository;
  conversations: ConversationRepository;
  bookings: BookingRepository;
  pricing: PricingService;
  whatsapp: MetaWhatsAppService;
  calendar: CalendarService;
};
