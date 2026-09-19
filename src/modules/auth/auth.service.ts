import bcrypt from "bcrypt";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { UnauthorizedError } from "../../http/errors";
import { AuthRepository } from "./auth.repository";

const SALT_ROUNDS = 12;

type Principal = {
  userId: string;
  role: "SUPER_ADMIN" | "TENANT_ADMIN";
  tenantId?: string;
  email: string;
  name: string | null;
};

type TokenResult = {
  accessToken: string;
  refreshToken: string;
};

export class AuthService {
  constructor(private readonly repository = new AuthRepository()) {}

  async login(email: string, password: string): Promise<TokenResult> {
    const user = await this.repository.findUserByEmail(email.toLowerCase());

    if (!user || !user.active) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const matches = await bcrypt.compare(password, user.passwordHash);

    if (!matches) {
      throw new UnauthorizedError("Invalid credentials");
    }

    if (user.role === "TENANT_ADMIN" && !user.tenantId) {
      throw new UnauthorizedError("Invalid account configuration");
    }

    await this.repository.updateLastLogin(user.id);

    return this.issueTokens({
      userId: user.id,
      role: user.role,
      tenantId: user.tenantId ?? undefined,
      email: user.email,
      name: user.name
    });
  }

  async refresh(refreshToken: string): Promise<TokenResult> {
    let claims: jwt.JwtPayload;

    try {
      const verified = jwt.verify(refreshToken, env.ADMIN_JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE
      });

      if (typeof verified === "string") {
        throw new Error("Invalid token");
      }

      claims = verified;
    } catch {
      throw new UnauthorizedError("Invalid refresh token");
    }

    if (
      claims.type !== "refresh" ||
      typeof claims.sub !== "string" ||
      typeof claims.jti !== "string"
    ) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    const tokenHash = this.hashToken(refreshToken);
    const session = await this.repository.findActiveRefreshSession(
      claims.jti,
      tokenHash
    );

    if (!session || !session.user.active) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    if (session.user.role === "TENANT_ADMIN" && !session.user.tenantId) {
      throw new UnauthorizedError("Invalid account configuration");
    }

    const principal = {
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId ?? undefined,
      email: session.user.email,
      name: session.user.name
    };

    const next = this.buildTokenPair(principal);
    const rotated = await this.repository.rotateRefreshSession(session.id, {
      userId: principal.userId,
      jti: next.refreshJti,
      tokenHash: this.hashToken(next.refreshToken),
      expiresAt: next.refreshExpiresAt
    });

    if (!rotated) {
      throw new UnauthorizedError("Refresh token already used");
    }

    return {
      accessToken: next.accessToken,
      refreshToken: next.refreshToken
    };
  }

  private async issueTokens(principal: Principal) {
    const tokens = this.buildTokenPair(principal);

    await this.repository.createRefreshSession({
      userId: principal.userId,
      jti: tokens.refreshJti,
      tokenHash: this.hashToken(tokens.refreshToken),
      expiresAt: tokens.refreshExpiresAt
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    };
  }

  private buildTokenPair(principal: Principal) {
    const accessToken = jwt.sign(
      {
        type: "access",
        role: principal.role,
        tenantId: principal.tenantId
      },
      env.ADMIN_JWT_SECRET,
      {
        algorithm: "HS256",
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        subject: principal.userId,
        expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"]
      }
    );

    const refreshJti = crypto.randomUUID();
    const refreshToken = jwt.sign(
      {
        type: "refresh",
        role: principal.role,
        tenantId: principal.tenantId
      },
      env.ADMIN_JWT_SECRET,
      {
        algorithm: "HS256",
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        subject: principal.userId,
        jwtid: refreshJti,
        expiresIn: env.REFRESH_TOKEN_TTL as jwt.SignOptions["expiresIn"]
      }
    );

    return {
      accessToken,
      refreshToken,
      refreshJti,
      refreshExpiresAt: new Date(
        Date.now() + parseDurationMilliseconds(env.REFRESH_TOKEN_TTL)
      )
    };
  }

  static async hashPassword(password: string) {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  private hashToken(token: string) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}

function parseDurationMilliseconds(value: string) {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(value.trim());

  if (!match) {
    throw new Error("Invalid token duration configuration");
  }

  const amount = Number(match[1]);
  const multiplier = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  }[match[2].toLowerCase() as "s" | "m" | "h" | "d"];

  return amount * multiplier;
}
