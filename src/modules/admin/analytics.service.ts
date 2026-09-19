import { prisma } from "../../config/prisma";

export class AnalyticsService {
  async getTenantAnalytics(tenantId: string, from?: Date, to?: Date) {
    const conversationWhere = {
      tenantId,
      ...(from || to ? {
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {})
        }
      } : {})
    };

    const bookingWhere = {
      tenantId,
      ...(from || to ? {
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {})
        }
      } : {})
    };

    const [
      revenueAggregate,
      bookingCount,
      bookingStatusGroups,
      conversationGroups,
      activeCustomerRows,
      recentCustomerRows
    ] = await Promise.all([
      prisma.booking.aggregate({
        where: {
          ...bookingWhere,
          status: {
            in: ["CONFIRMED", "COMPLETED"]
          }
        },
        _sum: {
          priceMinor: true
        }
      }),
      prisma.booking.count({
        where: bookingWhere
      }),
      prisma.booking.groupBy({
        by: ["status"],
        where: bookingWhere,
        _count: {
          _all: true
        }
      }),
      prisma.conversationState.groupBy({
        by: ["step"],
        where: conversationWhere,
        _count: {
          _all: true
        }
      }),
      prisma.conversationState.findMany({
        where: {
          tenantId,
          updatedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        },
        select: {
          customerPhone: true
        },
        distinct: ["customerPhone"]
      }),
      prisma.booking.findMany({
        where: bookingWhere,
        select: {
          customerPhone: true
        },
        distinct: ["customerPhone"]
      })
    ]);

    const totalConversations = conversationGroups.reduce(
      (sum, group) => sum + group._count._all,
      0
    );
    const bookedConversations = countStep(conversationGroups, "BOOKED");
    const quoteConversations =
      countStep(conversationGroups, "QUOTING") +
      countStep(conversationGroups, "SLOT_LOOKUP") +
      countStep(conversationGroups, "AWAITING_CONFIRMATION") +
      bookedConversations;
    const slotConversations =
      countStep(conversationGroups, "SLOT_LOOKUP") +
      countStep(conversationGroups, "AWAITING_CONFIRMATION") +
      bookedConversations;

    return {
      revenueMinor: revenueAggregate._sum.priceMinor ?? 0,
      bookings: {
        total: bookingCount,
        byStatus: Object.fromEntries(
          bookingStatusGroups.map(group => [group.status, group._count._all])
        )
      },
      funnel: {
        totalConversations,
        quoteStage: quoteConversations,
        slotStage: slotConversations,
        booked: bookedConversations,
        quoteRate: percentage(quoteConversations, totalConversations),
        slotRate: percentage(slotConversations, totalConversations),
        bookingConversionRate: percentage(bookedConversations, totalConversations)
      },
      activeUsers: {
        uniqueCustomersLast30Days: activeCustomerRows.length,
        uniqueCustomersInRange: recentCustomerRows.length
      }
    };
  }
}

function countStep(
  groups: Array<{ step: string; _count: { _all: number } }>,
  step: string
) {
  return groups.find(group => group.step === step)?._count._all ?? 0;
}

function percentage(value: number, total: number) {
  return total === 0 ? 0 : Number(((value / total) * 100).toFixed(2));
}
