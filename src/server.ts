import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "server.started");
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ signal }, "server.shutdown_started");

  const forceShutdown = setTimeout(() => {
    logger.error("server.shutdown_timeout");
    process.exit(1);
  }, 10_000);

  forceShutdown.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    await prisma.$disconnect();
    clearTimeout(forceShutdown);
    logger.info("server.shutdown_completed");
    process.exit(0);
  } catch (error) {
    clearTimeout(forceShutdown);
    logger.error({ err: error }, "server.shutdown_failed");
    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});
