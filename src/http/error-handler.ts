import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "../config/logger";
import { AppError } from "./errors";

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const correlationId = request.correlationId;

  if (error instanceof AppError) {
    request.log?.warn({
      err: error,
      code: error.code,
      statusCode: error.statusCode
    }, "application.error");

    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      },
      correlationId
    });
    return;
  }

  if (error instanceof ZodError) {
    request.log?.warn({
      err: error
    }, "validation.error");

    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues.map(issue => ({
          path: issue.path,
          message: issue.message
        }))
      },
      correlationId
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(error);

    request.log?.warn({
      err: error,
      prismaCode: error.code,
      statusCode: mapped.statusCode
    }, "database.error");

    response.status(mapped.statusCode).json({
      error: {
        code: mapped.code,
        message: mapped.message
      },
      correlationId
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    request.log?.error({ err: error }, "database.validation.error");

    response.status(500).json({
      error: {
        code: "DATABASE_VALIDATION_ERROR",
        message: "Database operation failed"
      },
      correlationId
    });
    return;
  }

  logger.error({
    err: error,
    correlationId,
    method: request.method,
    path: request.path
  }, "unhandled.error");

  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error"
    },
    correlationId
  });
};

function mapPrismaError(error: Prisma.PrismaClientKnownRequestError) {
  switch (error.code) {
    case "P2002":
      return {
        statusCode: 409,
        code: "CONFLICT",
        message: "Resource already exists"
      };
    case "P2025":
      return {
        statusCode: 404,
        code: "NOT_FOUND",
        message: "Resource not found"
      };
    default:
      return {
        statusCode: 500,
        code: "DATABASE_ERROR",
        message: "Database operation failed"
      };
  }
}
