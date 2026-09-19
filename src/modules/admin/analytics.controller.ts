import type { Request, Response } from "express";
import { asyncHandler } from "../../http/async-handler";
import { ValidationError } from "../../http/errors";
import { resolveTenantId } from "./admin-scope";
import { AnalyticsService } from "./analytics.service";

const analytics = new AnalyticsService();

export const getAnalytics = asyncHandler(async (request: Request, response: Response) => {
  const tenantId = resolveTenantId(request, optionalString(request.query.tenantId));
  const from = parseDate(request.query.from);
  const to = parseDate(request.query.to);

  if (from && to && from > to) {
    throw new ValidationError("The from date must be before the to date");
  }

  const result = await analytics.getTenantAnalytics(tenantId, from, to);

  response.json({
    data: {
      tenantId,
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      ...result
    }
  });
});

function parseDate(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ValidationError("Invalid analytics date");
  }

  return date;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
