import { prisma } from "../../config/prisma";
import { ConflictError } from "../../http/errors";
import type { BookingStatus, Prisma } from "@prisma/client";

export type CreateBookingInput = {
  tenantId: string;
  serviceId: string;
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  customerParameters: Prisma.InputJsonValue;
  status: "PENDING" | "CONFIRMED";
  calendarEventId?: string | null;
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

  async confirmForTenant(tenantId: string, bookingId: string, calendarEventId: string) {
    const result = await prisma.booking.updateMany({
      where: {
        id: bookingId,
        tenantId,
        status: "PENDING"
      },
      data: {
        status: "CONFIRMED",
        calendarEventId
      }
    });

    if (result.count !== 1) {
      throw new ConflictError("Booking could not be confirmed");
    }

    return prisma.booking.findUniqueOrThrow({
      where: { id: bookingId }
    });
  }

  async deleteForTenant(tenantId: string, bookingId: string) {
    return prisma.booking.deleteMany({
      where: {
        id: bookingId,
        tenantId,
        status: "PENDING"
      }
    });
  }

  findById(bookingId: string) {
    return prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
        tenant: true
      }
    });
  }

  findByIdForTenant(tenantId: string, bookingId: string) {
    return prisma.booking.findFirst({
      where: {
        id: bookingId,
        tenantId
      },
      include: {
        service: true,
        tenant: true
      }
    });
  }

  listForTenant(
    tenantId: string,
    filters: {
      status?: BookingStatus;
      from?: Date;
      to?: Date;
      limit: number;
      offset: number;
    }
  ) {
    return prisma.booking.findMany({
      where: {
        tenantId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from || filters.to
          ? {
              startAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {})
              }
            }
          : {})
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            durationMinutes: true
          }
        }
      },
      orderBy: {
        startAt: "desc"
      },
      take: filters.limit,
      skip: filters.offset
    });
  }

  async updateStatusForTenant(
    tenantId: string,
    bookingId: string,
    status: BookingStatus
  ) {
    const result = await prisma.booking.updateMany({
      where: {
        id: bookingId,
        tenantId
      },
      data: {
        status
      }
    });

    if (result.count !== 1) {
      return null;
    }

    return prisma.booking.findUnique({
      where: { id: bookingId }
    });
  }

  async updateScheduleForTenant(
    tenantId: string,
    bookingId: string,
    startAt: Date,
    endAt: Date
  ) {
    const result = await prisma.booking.updateMany({
      where: {
        id: bookingId,
        tenantId,
        status: {
          in: ["PENDING", "CONFIRMED"]
        }
      },
      data: {
        startAt,
        endAt
      }
    });

    if (result.count !== 1) {
      return null;
    }

    return prisma.booking.findUnique({
      where: { id: bookingId }
    });
  }

  async cancelForTenant(tenantId: string, bookingId: string) {
    const result = await prisma.booking.updateMany({
      where: {
        id: bookingId,
        tenantId,
        status: {
          in: ["PENDING", "CONFIRMED"]
        }
      },
      data: {
        status: "CANCELLED"
      }
    });

    if (result.count !== 1) {
      return null;
    }

    return prisma.booking.findUnique({
      where: { id: bookingId }
    });
  }
}
