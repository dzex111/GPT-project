import "express-serve-static-core";
import "http";
import type { Logger } from "pino";

export type AuthPrincipal = {
  userId: string;
  role: "SUPER_ADMIN" | "TENANT_ADMIN";
  tenantId?: string;
};

declare module "express-serve-static-core" {
  interface Request {
    rawBody?: Buffer;
    correlationId?: string;
    log?: Logger;
    auth?: AuthPrincipal;
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}
