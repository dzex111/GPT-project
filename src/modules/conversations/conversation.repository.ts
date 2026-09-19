import { prisma } from "../../config/prisma";
import { ConflictError } from "../../http/errors";
import type { ConversationStep, Prisma } from "@prisma/client";

export class ConversationRepository {
  async findOrCreate(tenantId: string, customerPhone: string, customerName?: string) {
    return prisma.conversationState.upsert({
      where: {
        tenantId_customerPhone: {
          tenantId,
          customerPhone
        }
      },
      update: customerName ? { customerName } : {},
      create: {
        tenantId,
        customerPhone,
        customerName,
        step: "SERVICE_SELECTION",
        collectedParameters: {}
      }
    });
  }

  async updateOptimistic(
    id: string,
    version: number,
    data: {
      step?: ConversationStep;
      serviceId?: string | null;
      customerName?: string | null;
      collectedParameters?: Prisma.InputJsonValue;
      quotedPriceMinor?: number | null;
      selectedSlotStart?: Date | null;
      selectedSlotEnd?: Date | null;
      availableSlots?: Prisma.InputJsonValue | null;
      bookingId?: string | null;
      lastInboundMessageId?: string | null;
    }
  ) {
    const result = await prisma.conversationState.updateMany({
      where: { id, version },
      data: {
        ...data,
        version: { increment: 1 }
      }
    });

    if (result.count !== 1) {
      throw new ConflictError();
    }

    return prisma.conversationState.findUniqueOrThrow({
      where: { id }
    });
  }
}
