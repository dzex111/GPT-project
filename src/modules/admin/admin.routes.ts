import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env";
import { asyncHandler } from "../../http/async-handler";
import { requireAdmin } from "./admin-auth.middleware";
import {
  createTenant,
  getTenant,
  updateTenant
} from "./tenant-admin.controller";
import {
  createService,
  deleteService,
  listServices,
  updateService
} from "./service-admin.controller";
import {
  cancelBooking,
  listBookings
} from "./booking-admin.controller";

export const adminRouter = Router();

adminRouter.use(
  rateLimit({
    windowMs: env.ADMIN_RATE_LIMIT_WINDOW_MS,
    limit: env.ADMIN_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false
  })
);

adminRouter.use(requireAdmin);

adminRouter.post("/tenants", createTenant);
adminRouter.get("/tenants/:tenantId", getTenant);
adminRouter.put("/tenants/:tenantId", updateTenant);

adminRouter.get("/services", listServices);
adminRouter.post("/services", createService);
adminRouter.put("/services/:serviceId", updateService);
adminRouter.delete("/services/:serviceId", deleteService);

adminRouter.get("/bookings", listBookings);
adminRouter.post(
  "/bookings/:bookingId/cancel",
  asyncHandler(cancelBooking)
);
