import { createApp } from './app.js';
import { env } from './config/env.js';
import { startJobs } from './jobs/index.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`ITSoc API listening on http://localhost:${env.port}`);
});

const stopJobs = startJobs();

const shutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  stopJobs();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  // Force exit if connections do not drain in time.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
