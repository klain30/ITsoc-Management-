import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { sendEventReminders } from './event-reminders.js';

type Job = { name: string; intervalMs: number; run: () => Promise<unknown> };

const JOBS: Job[] = [{ name: 'event-reminders', intervalMs: 15 * 60 * 1000, run: sendEventReminders }];

/**
 * Minimal in-process scheduler. Each job claims its work with conditional
 * updates, so running several API instances does not duplicate work.
 * Returns a function that stops all jobs.
 */
export const startJobs = () => {
  if (env.isTest) return () => undefined;

  const timers = JOBS.map((job) => {
    const tick = () =>
      job.run().catch((err: unknown) => {
        logger.error({ err, job: job.name }, 'Background job failed');
      });
    setTimeout(tick, 5_000).unref();
    return setInterval(tick, job.intervalMs);
  });

  return () => timers.forEach(clearInterval);
};
