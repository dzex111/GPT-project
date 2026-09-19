import { Router } from "express";
import { requireApiKey } from "../modules/auth/api-key.middleware";

export const internalRouter = Router();

internalRouter.use(requireApiKey);

internalRouter.get("/ping", (request, response) => {
  response.json({
    data: {
      status: "ok",
      tenantId: request.auth?.tenantId ?? null
    },
    correlationId: request.correlationId
  });
});
