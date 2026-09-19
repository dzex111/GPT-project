import { prisma } from "../../config/prisma";
import type { Prisma } from "@prisma/client";

export type CreateBookingInput = {
  tenantId: string;
  serviceId: string;
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  customerParameters: Prisma.InputJsonValue;
  status: "PENDING" | "CONFIRMED";
  calendarEventId: string;
  startAt: Date;
  endAt: Date;
  priceMinor: number;
  currency: string;
};

export class BookingRepository {
  create(input: CreateBookingInput) {
    return prisma.booking.create({
      data: input
    });
  }
}
