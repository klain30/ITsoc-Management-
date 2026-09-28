import type { NotificationType, Prisma } from '@prisma/client';

import { notFound } from '../../common/errors.js';
import { paginated, toSkipTake, type PaginationInput } from '../../common/pagination.js';
import { prisma, type Db } from '../../lib/prisma.js';

export type NotificationContent = {
  type: NotificationType;
  title: string;
  body: string;
  /** In-app path, e.g. /events/abc */
  link?: string;
};

export const notifyUsers = async (db: Db, userIds: string[], content: NotificationContent) => {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return 0;
  const result = await db.notification.createMany({ data: unique.map((userId) => ({ userId, ...content })) });
  return result.count;
};

/** Notifies the active accounts behind the given member ids. */
export const notifyMembers = async (db: Db, memberIds: string[], content: NotificationContent) => {
  if (memberIds.length === 0) return 0;
  const users = await db.user.findMany({
    where: { memberId: { in: memberIds }, status: 'ACTIVE' },
    select: { id: true },
  });
  return notifyUsers(
    db,
    users.map((user) => user.id),
    content,
  );
};

export const notifyAllActiveMembers = async (db: Db, content: NotificationContent) => {
  const users = await db.user.findMany({
    where: { status: 'ACTIVE', member: { status: 'ACTIVE' } },
    select: { id: true },
  });
  return notifyUsers(
    db,
    users.map((user) => user.id),
    content,
  );
};

export const listNotifications = async (userId: string, input: PaginationInput & { unreadOnly: boolean }) => {
  const where: Prisma.NotificationWhereInput = { userId, readAt: input.unreadOnly ? null : undefined };
  const [rows, total, unread] = await prisma.$transaction([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(input) }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  const page = paginated(rows, total, input);
  return { ...page, meta: { ...page.meta, unread } };
};

export const unreadCount = (userId: string) => prisma.notification.count({ where: { userId, readAt: null } });

/** Scoped by userId so nobody can touch another user's notifications. */
export const markRead = async (userId: string, notificationId: string) => {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.notification.count({ where: { id: notificationId, userId } });
    if (!exists) throw notFound('Notification');
  }
};

export const markAllRead = (userId: string) =>
  prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
