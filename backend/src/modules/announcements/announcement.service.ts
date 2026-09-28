import { AnnouncementStatus, Prisma } from '@prisma/client';
import { z } from 'zod';

import { notFound, unprocessable } from '../../common/errors.js';
import { paginated, paginationSchema, searchSchema, toSkipTake } from '../../common/pagination.js';
import type { ActorContext } from '../../common/request.js';
import { prisma } from '../../lib/prisma.js';
import { diffFields, recordAudit } from '../audit/audit.service.js';
import { notifyAllActiveMembers } from '../notifications/notification.service.js';

const fields = {
  title: z.string().trim().min(3).max(150),
  content: z.string().trim().min(3).max(10_000),
  isPinned: z.boolean().default(false),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .pipe(z.coerce.date())
    .nullish()
    .transform((value) => value ?? null),
};

export const createAnnouncementSchema = z.object({ ...fields, publish: z.boolean().default(false) });
export const updateAnnouncementSchema = z
  .object({ ...fields, isPinned: z.boolean() })
  .partial()
  .strict();

export const listAnnouncementsSchema = paginationSchema.extend({
  status: z.union([z.nativeEnum(AnnouncementStatus), z.literal('ALL')]).optional(),
  search: searchSchema,
});

const select = {
  id: true,
  title: true,
  content: true,
  status: true,
  isPinned: true,
  publishedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { member: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.AnnouncementSelect;

const toDto = ({ author, ...announcement }: Prisma.AnnouncementGetPayload<{ select: typeof select }>) => ({
  ...announcement,
  author: `${author.member.firstName} ${author.member.lastName}`,
});

/** What regular members can see: published and not expired. */
const liveFilter = (): Prisma.AnnouncementWhereInput => ({
  status: 'PUBLISHED',
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

export const listAnnouncements = async (input: z.infer<typeof listAnnouncementsSchema>, canManage: boolean) => {
  const scope: Prisma.AnnouncementWhereInput =
    canManage && input.status ? (input.status === 'ALL' ? {} : { status: input.status }) : liveFilter();
  const where: Prisma.AnnouncementWhereInput = {
    AND: [
      scope,
      input.search
        ? {
            OR: [
              { title: { contains: input.search, mode: 'insensitive' } },
              { content: { contains: input.search, mode: 'insensitive' } },
            ],
          }
        : {},
    ],
  };
  const [rows, total] = await prisma.$transaction([
    prisma.announcement.findMany({
      where,
      select,
      orderBy: [{ isPinned: 'desc' }, { publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
      ...toSkipTake(input),
    }),
    prisma.announcement.count({ where }),
  ]);
  return paginated(rows.map(toDto), total, input);
};

export const getAnnouncement = async (id: string, canManage: boolean) => {
  const row = await prisma.announcement.findFirst({ where: { id, ...(canManage ? {} : liveFilter()) }, select });
  if (!row) throw notFound('Announcement');
  return toDto(row);
};

const publishInTx = async (tx: Prisma.TransactionClient, id: string, actor: ActorContext) => {
  const announcement = await tx.announcement.update({
    where: { id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
    select: { id: true, title: true },
  });
  await notifyAllActiveMembers(tx, {
    type: 'ANNOUNCEMENT_PUBLISHED',
    title: 'New announcement',
    body: announcement.title,
    link: '/announcements',
  });
  await recordAudit(tx, actor, {
    action: 'announcement.published',
    entityType: 'Announcement',
    entityId: id,
    metadata: { title: announcement.title },
  });
};

export const createAnnouncement = async (
  { publish, ...input }: z.infer<typeof createAnnouncementSchema>,
  actor: ActorContext & { userId: string },
) => {
  if (input.expiresAt && input.expiresAt <= new Date()) throw unprocessable('The expiry date must be in the future.');
  const id = await prisma.$transaction(async (tx) => {
    const announcement = await tx.announcement.create({ data: { ...input, authorId: actor.userId }, select: { id: true } });
    await recordAudit(tx, actor, {
      action: 'announcement.created',
      entityType: 'Announcement',
      entityId: announcement.id,
      metadata: { title: input.title },
    });
    if (publish) await publishInTx(tx, announcement.id, actor);
    return announcement.id;
  });
  return getAnnouncement(id, true);
};

export const updateAnnouncement = async (id: string, input: z.infer<typeof updateAnnouncementSchema>, actor: ActorContext) => {
  const before = await prisma.announcement.findUnique({ where: { id } });
  if (!before) throw notFound('Announcement');
  if (before.status === 'ARCHIVED') throw unprocessable('Archived announcements cannot be edited.');
  if (input.expiresAt && input.expiresAt <= new Date()) throw unprocessable('The expiry date must be in the future.');
  await prisma.$transaction(async (tx) => {
    await tx.announcement.update({ where: { id }, data: input });
    await recordAudit(tx, actor, {
      action: 'announcement.updated',
      entityType: 'Announcement',
      entityId: id,
      metadata: { changes: diffFields(before, input) },
    });
  });
  return getAnnouncement(id, true);
};

/** Members are notified only on the first publish. */
export const publishAnnouncement = async (id: string, actor: ActorContext) => {
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) throw notFound('Announcement');
  if (announcement.status !== 'DRAFT') throw unprocessable('Only drafts can be published.');
  await prisma.$transaction((tx) => publishInTx(tx, id, actor));
  return getAnnouncement(id, true);
};

export const archiveAnnouncement = async (id: string, actor: ActorContext) => {
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) throw notFound('Announcement');
  if (announcement.status === 'ARCHIVED') return getAnnouncement(id, true);
  await prisma.$transaction(async (tx) => {
    await tx.announcement.update({ where: { id }, data: { status: 'ARCHIVED', isPinned: false } });
    await recordAudit(tx, actor, {
      action: 'announcement.archived',
      entityType: 'Announcement',
      entityId: id,
      metadata: { title: announcement.title },
    });
  });
  return getAnnouncement(id, true);
};
