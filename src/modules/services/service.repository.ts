import { prisma } from "../../config/prisma";
import type { Prisma } from "@prisma/client";

export class ServiceRepository {
  listActive(tenantId: string) {
    return prisma.service.findMany({
      where: { tenantId, active: true },
      orderBy: { name: "asc" }
    });
  }

  listForTenant(tenantId: string) {
    return prisma.service.findMany({
      where: { tenantId },
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });
  }

  findByIdForTenant(tenantId: string, serviceId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId, tenantId, active: true }
    });
  }

  findAnyByIdForTenant(tenantId: string, serviceId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId, tenantId }
    });
  }

  create(input: {
    tenantId: string;
    name: string;
    basePriceMinor: number;
    durationMinutes: number;
    currency: string;
    parameters: Prisma.InputJsonValue;
    active: boolean;
  }) {
    return prisma.service.create({
      data: input
    });
  }

  updateForTenant(
    tenantId: string,
    serviceId: string,
    data: Prisma.ServiceUpdateInput
  ) {
    return prisma.service.updateMany({
      where: {
        id: serviceId,
        tenantId
      },
      data
    });
  }

  deleteForTenant(tenantId: string, serviceId: string) {
    return prisma.service.updateMany({
      where: {
        id: serviceId,
        tenantId
      },
      data: {
        active: false
      }
    });
  }
}
