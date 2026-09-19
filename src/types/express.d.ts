import "express-serve-static-core";

export type AdminPrincipal = {
  role: "admin";
  tenantId?: string;
  subject?: string;
};

declare module "express-serve-static-core" {
  interface Request {
    rawBody?: Buffer;
    admin?: AdminPrincipal;
  }
}
