import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { notifyMembers } from '../modules/notifications/notification.service.js';

const REMIND_AHEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Notifies registrants of events starting within the next 24 hours, once
 * per event. Each event is claimed with a conditional update, so two
 * instances running this job never double-send.
 */
export const sendEventReminders = async () => {
  const now = new Date();
  const due = await prisma.event.findMany({
    where: {
      status: 'PUBLISHED',
      reminderSentAt: null,
      startsAt: { gt: now, lte: new Date(now.getTime() + REMIND_AHEAD_MS) },
    },
    select: { id: true, name: true, startsAt: true, location: true },
  });

  for (const event of due) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.event.updateMany({ where: { id: event.id, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (claimed.count === 0) return;
      const registrants = await tx.eventRegistration.findMany({
        where: { eventId: event.id, status: 'REGISTERED' },
        select: { memberId: true },
      });
      const sent = await notifyMembers(
        tx,
        registrants.map((r) => r.memberId),
        {
          type: 'EVENT_REMINDER',
          title: 'Event tomorrow',
          body: `"${event.name}" starts soon at ${event.location}. Don't forget to check in with the QR code.`,
          link: `/events/${event.id}`,
        },
      );
      logger.info({ eventId: event.id, sent }, 'Event reminders sent');
    });
  }
  return due.length;
};
