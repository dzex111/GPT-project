import { prisma } from "../../config/prisma";

export class AuthRepository {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { tenant: true }
    });
  }

  findUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true }
    });
  }

  async updateLastLogin(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() }
    });
  }

  createRefreshSession(input: {
    userId: string;
    jti: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return prisma.refreshSession.create({
      data: input
    });
  }

  findActiveRefreshSession(jti: string, tokenHash: string) {
    return prisma.refreshSession.findFirst({
      where: {
        jti,
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: {
          include: {
            tenant: true
          }
        }
      }
    });
  }

  revokeRefreshSession(id: string) {
    return prisma.refreshSession.update({
      where: { id },
      data: { revokedAt: new Date() }
    });
  }

  async rotateRefreshSession(
    id: string,
    input: {
      userId: string;
      jti: string;
      tokenHash: string;
      expiresAt: Date;
    }
  ) {
    return prisma.$transaction(async transaction => {
      const revoked = await transaction.refreshSession.updateMany({
        where: {
          id,
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      });

      if (revoked.count !== 1) {
        return null;
      }

      return transaction.refreshSession.create({
        data: input
      });
    });
  }

  findApiKeyByHash(keyHash: string) {
    return prisma.apiKey.findFirst({
      where: {
        keyHash,
        active: true
      },
      include: {
        tenant: true
      }
    });
  }

  touchApiKey(id: string) {
    return prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() }
    });
  }
}
