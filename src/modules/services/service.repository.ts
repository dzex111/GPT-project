import { prisma } from "../../config/prisma";

export class ServiceRepository {
  listActive(tenantId: string) {
    return prisma.service.findMany({
      where: { tenantId, active: true },
      orderBy: { name: "asc" }
    });
  }

  findByIdForTenant(tenantId: string, serviceId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId, tenantId, active: true }
    });
  }
}
