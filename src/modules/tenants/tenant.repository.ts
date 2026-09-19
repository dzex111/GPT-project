import { prisma } from "../../config/prisma";

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
}
