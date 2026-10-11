import { Prisma, type MessageKind } from '@prisma/client';

import { forbidden, notFound, unprocessable } from '../../common/errors.js';
import type { AuthContext } from '../../common/request.js';
import { PERMISSIONS } from '../../auth/permissions.js';
import { prisma, type Db } from '../../lib/prisma.js';
import { emitToUsers, isUserOnline } from '../../lib/realtime.js';
import { describeCall, getCallForConversation } from './call-registry.js';

// ─── Shapes ─────────────────────────────────────────────────────────────────

const personSelect = {
  id: true,
  member: {
    select: {
      firstName: true,
      lastName: true,
      positionAssignments: { where: { endDate: null }, take: 1, select: { position: { select: { name: true } } } },
    },
  },
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

type PersonRow = Prisma.UserGetPayload<{ select: typeof personSelect }>;

const toPerson = (user: PersonRow) => ({
  userId: user.id,
  firstName: user.member.firstName,
  lastName: user.member.lastName,
  role: user.role.name,
  position: user.member.positionAssignments[0]?.position.name ?? null,
  online: isUserOnline(user.id),
});

const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  kind: true,
  body: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

/** Deleted messages keep their place in the thread but lose their text. */
const toMessage = (message: MessageRow) => ({ ...message, body: message.deletedAt ? '' : message.body });

const conversationInclude = {
  participants: {
    where: { leftAt: null },
    select: { userId: true, lastReadAt: true, user: { select: personSelect } },
    orderBy: { joinedAt: 'asc' },
  },
  messages: { orderBy: { createdAt: 'desc' }, take: 1, select: messageSelect },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

const toConversation = (row: ConversationRow, unreadCount = 0) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  createdById: row.createdById,
  lastMessageAt: row.lastMessageAt,
  createdAt: row.createdAt,
  participants: row.participants.map((p) => ({ ...toPerson(p.user), lastReadAt: p.lastReadAt })),
  lastMessage: row.messages[0] ? toMessage(row.messages[0]) : null,
  unreadCount,
  activeCall: describeCall(getCallForConversation(row.id)),
});

export type ConversationDto = ReturnType<typeof toConversation>;

// ─── Access rules ───────────────────────────────────────────────────────────

/**
 * Who you can start a chat with. Officers (anyone who can read the member
 * directory) can reach every active account. Members can reach the officers,
 * so a member cannot use chat to browse the directory they are not allowed to see.
 */
const contactFilter = (auth: AuthContext): Prisma.UserWhereInput => ({
  status: 'ACTIVE',
  id: { not: auth.userId },
  ...(auth.permissions.has(PERMISSIONS.MEMBERS_READ) ? {} : { role: { name: { not: 'MEMBER' } } }),
});

const assertCanContact = async (auth: AuthContext, userIds: string[]) => {
  const unique = [...new Set(userIds)].filter((id) => id !== auth.userId);
  if (unique.length === 0) return unique;
  const allowed = await prisma.user.count({ where: { AND: [contactFilter(auth), { id: { in: unique } }] } });
  if (allowed !== unique.length) {
    throw unprocessable('You can only start chats with active accounts you are allowed to contact.', 'CHAT_CONTACT_NOT_ALLOWED');
  }
  return unique;
};

/** Throws 404 unless the user is a current participant (so ids of other chats are not confirmed). */
export const assertParticipant = async (db: Db, conversationId: string, userId: string) => {
  const participant = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { leftAt: true },
  });
  if (!participant || participant.leftAt) throw notFound('Conversation');
};

export const participantIds = async (db: Db, conversationId: string) =>
  (
    await db.conversationParticipant.findMany({ where: { conversationId, leftAt: null }, select: { userId: true } })
  ).map((p) => p.userId);

// ─── Contacts ───────────────────────────────────────────────────────────────

export const listContacts = async (auth: AuthContext, search?: string) => {
  const where: Prisma.UserWhereInput = { AND: [contactFilter(auth)] };
  if (search) {
    (where.AND as Prisma.UserWhereInput[]).push({
      member: {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      },
    });
  }
  const users = await prisma.user.findMany({
    where,
    select: personSelect,
    orderBy: [{ member: { lastName: 'asc' } }, { member: { firstName: 'asc' } }],
    take: 100,
  });
  // Officers first, so "message my officers" is one click away.
  return users.map(toPerson).sort((a, b) => Number(a.role === 'MEMBER') - Number(b.role === 'MEMBER'));
};

// ─── Conversations ──────────────────────────────────────────────────────────

const unreadCounts = async (userId: string, conversationIds?: string[]) => {
  const rows = await prisma.$queryRaw<{ conversationId: string; count: bigint }[]>`
    SELECT p."conversationId", COUNT(m.id) AS count
    FROM "ConversationParticipant" p
    JOIN "Message" m
      ON m."conversationId" = p."conversationId"
     AND m."createdAt" > p."lastReadAt"
     AND m."senderId" <> p."userId"
     AND m."deletedAt" IS NULL
    WHERE p."userId" = ${userId} AND p."leftAt" IS NULL
    ${conversationIds ? Prisma.sql`AND p."conversationId" IN (${Prisma.join(conversationIds)})` : Prisma.empty}
    GROUP BY p."conversationId"`;
  return new Map(rows.map((row) => [row.conversationId, Number(row.count)]));
};

export const totalUnread = async (userId: string) => {
  let total = 0;
  for (const count of (await unreadCounts(userId)).values()) total += count;
  return total;
};

export const listConversations = async (userId: string) => {
  const rows = await prisma.conversation.findMany({
    where: { participants: { some: { userId, leftAt: null } } },
    include: conversationInclude,
    orderBy: { lastMessageAt: 'desc' },
    take: 200,
  });
  const unread = await unreadCounts(userId);
  return rows.map((row) => toConversation(row, unread.get(row.id) ?? 0));
};

export const getConversation = async (userId: string, conversationId: string) => {
  await assertParticipant(prisma, conversationId, userId);
  const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: conversationInclude });
  const unread = await unreadCounts(userId, [conversationId]);
  return toConversation(row, unread.get(conversationId) ?? 0);
};

/** Tells every participant (and, when given, people who just left) that a chat changed. */
const broadcastConversation = async (conversationId: string, extraUserIds: string[] = []) => {
  const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: conversationInclude });
  const ids = row.participants.map((p) => p.userId);
  // unreadCount is per user; clients refetch it, so send 0 here and let the list query own the number.
  emitToUsers([...ids, ...extraUserIds], 'chat:conversation', toConversation(row));
};

const directKey = (a: string, b: string) => [a, b].sort().join(':');

export const openDirect = async (auth: AuthContext, otherUserId: string) => {
  if (otherUserId === auth.userId) throw unprocessable('You cannot start a chat with yourself.', 'CHAT_SELF');
  await assertCanContact(auth, [otherUserId]);
  const key = directKey(auth.userId, otherUserId);

  const existing = await prisma.conversation.findUnique({ where: { directKey: key }, select: { id: true } });
  if (existing) return getConversation(auth.userId, existing.id);

  try {
    const created = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        directKey: key,
        createdById: auth.userId,
        participants: { create: [{ userId: auth.userId }, { userId: otherUserId }] },
      },
      select: { id: true },
    });
    await broadcastConversation(created.id);
    return getConversation(auth.userId, created.id);
  } catch (error) {
    // Both people opened the chat at the same moment: use the one that won.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await prisma.conversation.findUniqueOrThrow({ where: { directKey: key }, select: { id: true } });
      return getConversation(auth.userId, winner.id);
    }
    throw error;
  }
};

const fullName = async (db: Db, userId: string) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { member: { select: { firstName: true, lastName: true } } } });
  return `${user.member.firstName} ${user.member.lastName}`;
};

const systemMessage = (db: Db, conversationId: string, body: string, kind: MessageKind = 'SYSTEM', senderId: string | null = null) =>
  db.message.create({ data: { conversationId, body, kind, senderId }, select: messageSelect });

export const createGroup = async (auth: AuthContext, input: { title: string; userIds: string[] }) => {
  const others = await assertCanContact(auth, input.userIds);
  if (others.length === 0) throw unprocessable('Add at least one other person to the group.', 'CHAT_GROUP_EMPTY');

  const id = await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: {
        type: 'GROUP',
        title: input.title,
        createdById: auth.userId,
        participants: { create: [auth.userId, ...others].map((userId) => ({ userId })) },
      },
      select: { id: true },
    });
    await systemMessage(tx, conversation.id, `${await fullName(tx, auth.userId)} created the group “${input.title}”.`);
    return conversation.id;
  });
  await broadcastConversation(id);
  return getConversation(auth.userId, id);
};

const loadGroup = async (userId: string, conversationId: string) => {
  await assertParticipant(prisma, conversationId, userId);
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { type: true } });
  if (conversation.type !== 'GROUP') throw unprocessable('Only group chats can be changed.', 'CHAT_NOT_GROUP');
};

export const renameGroup = async (auth: AuthContext, conversationId: string, title: string) => {
  await loadGroup(auth.userId, conversationId);
  const message = await prisma.$transaction(async (tx) => {
    await tx.conversation.update({ where: { id: conversationId }, data: { title, lastMessageAt: new Date() } });
    return systemMessage(tx, conversationId, `${await fullName(tx, auth.userId)} renamed the group to “${title}”.`);
  });
  await publishMessage(message);
  await broadcastConversation(conversationId);
  return getConversation(auth.userId, conversationId);
};

export const addParticipants = async (auth: AuthContext, conversationId: string, userIds: string[]) => {
  await loadGroup(auth.userId, conversationId);
  const toAdd = await assertCanContact(auth, userIds);
  if (toAdd.length === 0) return getConversation(auth.userId, conversationId);

  const message = await prisma.$transaction(async (tx) => {
    for (const userId of toAdd) {
      await tx.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId, userId } },
        create: { conversationId, userId },
        update: { leftAt: null, joinedAt: new Date(), lastReadAt: new Date() },
      });
    }
    const names = await Promise.all(toAdd.map((id) => fullName(tx, id)));
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    return systemMessage(tx, conversationId, `${await fullName(tx, auth.userId)} added ${names.join(', ')}.`);
  });
  await publishMessage(message);
  await broadcastConversation(conversationId);
  return getConversation(auth.userId, conversationId);
};

export const leaveGroup = async (auth: AuthContext, conversationId: string) => {
  await loadGroup(auth.userId, conversationId);
  const message = await prisma.$transaction(async (tx) => {
    await tx.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: auth.userId } },
      data: { leftAt: new Date() },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    return systemMessage(tx, conversationId, `${await fullName(tx, auth.userId)} left the group.`);
  });
  await publishMessage(message);
  await broadcastConversation(conversationId, [auth.userId]);
};

// ─── Messages ───────────────────────────────────────────────────────────────

export const listMessages = async (userId: string, conversationId: string, input: { before?: string; limit: number }) => {
  await assertParticipant(prisma, conversationId, userId);
  let cursorDate: Date | undefined;
  if (input.before) {
    const cursor = await prisma.message.findFirst({ where: { id: input.before, conversationId }, select: { createdAt: true } });
    if (!cursor) throw notFound('Message');
    cursorDate = cursor.createdAt;
  }
  const rows = await prisma.message.findMany({
    where: { conversationId, ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: input.limit + 1,
    select: messageSelect,
  });
  const hasMore = rows.length > input.limit;
  // Oldest first, ready to render top to bottom.
  return { data: rows.slice(0, input.limit).reverse().map(toMessage), meta: { hasMore } };
};

/** Pushes a new message to every participant in real time. */
export const publishMessage = async (message: MessageRow) => {
  const ids = await participantIds(prisma, message.conversationId);
  emitToUsers(ids, 'chat:message', toMessage(message));
};

export const sendMessage = async (userId: string, conversationId: string, body: string) => {
  await assertParticipant(prisma, conversationId, userId);
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({ data: { conversationId, senderId: userId, body }, select: messageSelect });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
    // Sending a message means you have read everything before it.
    await tx.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: created.createdAt },
    });
    return created;
  });
  await publishMessage(message);
  return toMessage(message);
};

/** Writes a server-authored message (call summaries). Used by the call signalling code. */
export const recordCallMessage = async (conversationId: string, startedById: string, body: string) => {
  const message = await prisma.$transaction(async (tx) => {
    const created = await systemMessage(tx, conversationId, body, 'CALL', startedById);
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: created.createdAt } });
    return created;
  });
  await publishMessage(message);
};

export const deleteMessage = async (userId: string, messageId: string) => {
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { senderId: true, conversationId: true, kind: true, deletedAt: true } });
  if (!message) throw notFound('Message');
  await assertParticipant(prisma, message.conversationId, userId);
  if (message.senderId !== userId || message.kind !== 'TEXT') throw forbidden('You can only remove your own messages.');
  if (message.deletedAt) return;
  const updated = await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() }, select: messageSelect });
  const ids = await participantIds(prisma, updated.conversationId);
  emitToUsers(ids, 'chat:message-updated', toMessage(updated));
};

export const markRead = async (userId: string, conversationId: string) => {
  await assertParticipant(prisma, conversationId, userId);
  const now = new Date();
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: now },
  });
  const ids = await participantIds(prisma, conversationId);
  emitToUsers(ids, 'chat:read', { conversationId, userId, lastReadAt: now.toISOString() });
};
