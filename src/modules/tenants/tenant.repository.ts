import { prisma } from "../../config/prisma";
import type { Prisma } from "@prisma/client";

export class TenantRepository {
  findByWhatsAppPhoneNumberId(whatsappPhoneNumberId: string) {
    return prisma.tenant.findUnique({
      where: { whatsappPhoneNumberId }
    });
  }

  findByVerifyToken(whatsappVerifyToken: string) {
    return prisma.tenant.findUnique({
      where: { whatsappVerifyToken }
    });
  }

  findById(id: string) {
    return prisma.tenant.findUnique({
      where: { id }
    });
  }

  create(data: Prisma.TenantCreateInput) {
    return prisma.tenant.create({
      data
    });
  }

  updateById(id: string, data: Prisma.TenantUpdateInput) {
    return prisma.tenant.update({
      where: { id },
      data
    });
  }
}
