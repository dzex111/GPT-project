import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env";
import { requireAuth } from "../auth/auth.middleware";
import { allowRoles } from "../auth/role.middleware";
import {
  createTenant,
  getTenant,
  updateTenant
} from "./tenant-admin.controller";
import { updateTenantSettings } from "./tenant-settings.controller";
import {
  createService,
  deleteService,
  listServices,
  updateService
} from "./service-admin.controller";
import {
  cancelBooking,
  listBookings,
  updateBooking
} from "./booking-admin.controller";
import { getAnalytics } from "./analytics.controller";

export const adminRouter = Router();

adminRouter.use(
  rateLimit({
    windowMs: env.ADMIN_RATE_LIMIT_WINDOW_MS,
    limit: env.ADMIN_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false
  })
);

adminRouter.use(requireAuth);

adminRouter.post("/tenants", allowRoles("SUPER_ADMIN"), createTenant);
adminRouter.get("/tenants/:tenantId", allowRoles("SUPER_ADMIN", "TENANT_ADMIN"), getTenant);
adminRouter.put("/tenants/:tenantId", allowRoles("SUPER_ADMIN", "TENANT_ADMIN"), updateTenant);
adminRouter.patch(
  "/tenants/settings",
  allowRoles("SUPER_ADMIN", "TENANT_ADMIN"),
  updateTenantSettings
);

adminRouter.get("/services", allowRoles("SUPER_ADMIN", "TENANT_ADMIN"), listServices);
adminRouter.post("/services", allowRoles("SUPER_ADMIN", "TENANT_ADMIN"), createService);
adminRouter.put("/services/:serviceId", allowRoles("SUPER_ADMIN", "TENANT_ADMIN"), updateService);
adminRouter.delete("/services/:serviceId", allowRoles("SUPER_ADMIN", "TENANT_ADMIN"), deleteService);

adminRouter.get("/analytics", allowRoles("SUPER_ADMIN", "TENANT_ADMIN"), getAnalytics);
adminRouter.get("/bookings", allowRoles("SUPER_ADMIN", "TENANT_ADMIN"), listBookings);
adminRouter.put("/bookings/:bookingId", allowRoles("SUPER_ADMIN", "TENANT_ADMIN"), updateBooking);
adminRouter.delete("/bookings/:bookingId", allowRoles("SUPER_ADMIN", "TENANT_ADMIN"), cancelBooking);
