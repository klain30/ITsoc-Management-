import { Prisma, type RoleName, type UserStatus } from '@prisma/client';

import { OFFICER_ROLES } from '../../auth/permissions.js';
import { conflict, forbidden, notFound, unprocessable } from '../../common/errors.js';
import { paginated, toSkipTake } from '../../common/pagination.js';
import type { ActorContext } from '../../common/request.js';
import { prisma } from '../../lib/prisma.js';
import { storage } from '../../lib/storage.js';
import { diffFields, recordAudit } from '../audit/audit.service.js';
import { issueAccountToken } from '../auth/auth.service.js';
import type { CreateMemberInput, ListMembersInput, UpdateMemberInput } from './member.schemas.js';

export const memberSelect = {
  id: true,
  studentId: true,
  firstName: true,
  middleName: true,
  lastName: true,
  email: true,
  course: true,
  yearLevel: true,
  section: true,
  contactNumber: true,
  profileImageKey: true,
  status: true,
  dateJoined: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, status: true, lastLoginAt: true, role: { select: { name: true } } } },
  positionAssignments: {
    where: { endDate: null },
    select: { id: true, startDate: true, position: { select: { id: true, name: true } } },
    take: 1,
  },
} satisfies Prisma.MemberSelect;

type MemberRow = Prisma.MemberGetPayload<{ select: typeof memberSelect }>;

export const toMemberDto = ({ user, positionAssignments, profileImageKey, ...member }: MemberRow) => ({
  ...member,
  fullName: [member.firstName, member.middleName, member.lastName].filter(Boolean).join(' '),
  hasProfileImage: Boolean(profileImageKey),
  position: positionAssignments[0]
    ? { ...positionAssignments[0].position, assignmentId: positionAssignments[0].id, since: positionAssignments[0].startDate }
    : null,
  account: user ? { userId: user.id, status: user.status, role: user.role.name, lastLoginAt: user.lastLoginAt } : null,
});

export type MemberDto = ReturnType<typeof toMemberDto>;

const ORDER_BY: Record<ListMembersInput['sort'], Prisma.MemberOrderByWithRelationInput[]> = {
  name: [{ lastName: 'asc' }, { firstName: 'asc' }],
  studentId: [{ studentId: 'asc' }],
  dateJoined: [{ dateJoined: 'desc' }],
  createdAt: [{ createdAt: 'desc' }],
};

export const listMembers = async (input: ListMembersInput) => {
  const where: Prisma.MemberWhereInput = {
    status: input.status,
    user: input.role
      ? { role: { name: input.role } }
      : input.officersOnly
        ? { role: { name: { in: OFFICER_ROLES } } }
        : undefined,
  };
  if (input.search) {
    const contains = { contains: input.search, mode: 'insensitive' as const };
    where.OR = [
      { firstName: contains },
      { lastName: contains },
      { email: contains },
      { studentId: contains },
      { course: contains },
    ];
  }

  const [rows, total] = await prisma.$transaction([
    prisma.member.findMany({ where, select: memberSelect, orderBy: ORDER_BY[input.sort], ...toSkipTake(input) }),
    prisma.member.count({ where }),
  ]);
  return paginated(rows.map(toMemberDto), total, input);
};

export const getMember = async (id: string) => {
  const member = await prisma.member.findUnique({ where: { id }, select: memberSelect });
  if (!member) throw notFound('Member');
  return toMemberDto(member);
};

export const getMemberSummary = async (id: string) => {
  const [registrations, attendance, certificates, positions] = await prisma.$transaction([
    prisma.eventRegistration.count({ where: { memberId: id, status: 'REGISTERED' } }),
    prisma.attendance.groupBy({ by: ['status'], where: { memberId: id }, _count: { _all: true }, orderBy: { status: 'asc' } }),
    prisma.certificate.count({ where: { memberId: id, revokedAt: null } }),
    prisma.positionAssignment.findMany({
      where: { memberId: id },
      orderBy: { startDate: 'desc' },
      select: { id: true, startDate: true, endDate: true, position: { select: { id: true, name: true } } },
    }),
  ]);
  const attendanceByStatus = Object.fromEntries(
    attendance.map((row) => [row.status, (row._count as { _all: number })._all]),
  ) as Partial<Record<'PRESENT' | 'LATE' | 'ABSENT', number>>;
  return { registrations, attendance: attendanceByStatus, certificates, positionHistory: positions };
};

/**
 * Creates the member profile plus an INVITED account and returns a one-time
 * invitation link. There is no public sign-up: officers invite members.
 */
export const createMember = async (input: CreateMemberInput, actor: ActorContext & { userId: string }) => {
  const memberRole = await prisma.role.findUniqueOrThrow({ where: { name: 'MEMBER' } });

  return prisma.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: { ...input, user: { create: { roleId: memberRole.id, status: 'INVITED' } } },
      select: memberSelect,
    });
    const invitation = await issueAccountToken(tx, member.user!.id, 'INVITATION', actor.userId);
    await recordAudit(tx, actor, {
      action: 'member.created',
      entityType: 'Member',
      entityId: member.id,
      metadata: { studentId: member.studentId, email: member.email },
    });
    await recordAudit(tx, actor, { action: 'user.invitation_issued', entityType: 'User', entityId: member.user!.id });
    return { member: toMemberDto(member), invitation };
  });
};

/** True when the member's login account has an officer role. */
export const isOfficerAccount = async (memberId: string) => {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { user: { select: { role: { select: { name: true } } } } } });
  return Boolean(member?.user && member.user.role.name !== 'MEMBER');
};

export const updateMember = async (id: string, input: UpdateMemberInput, actor: ActorContext) => {
  const before = await prisma.member.findUnique({ where: { id } });
  if (!before) throw notFound('Member');

  return prisma.$transaction(async (tx) => {
    const member = await tx.member.update({ where: { id }, data: input, select: memberSelect });
    const changes = diffFields(before, input);
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, actor, { action: 'member.updated', entityType: 'Member', entityId: id, metadata: { changes } });
    }
    return toMemberDto(member);
  });
};

/**
 * Hard delete is only for mistakes (e.g. a member created with the wrong
 * details who never took part in anything). Members with history must be
 * set to INACTIVE or ALUMNI instead; foreign keys enforce this too.
 */
export const deleteMember = async (id: string, actor: ActorContext) => {
  const member = await prisma.member.findUnique({
    where: { id },
    select: {
      id: true,
      studentId: true,
      email: true,
      profileImageKey: true,
      user: { select: { id: true, lastLoginAt: true } },
      _count: { select: { registrations: true, attendance: true, certificates: true, positionAssignments: true, paidExpenses: true } },
    },
  });
  if (!member) throw notFound('Member');
  if (member.user?.id === actor.userId) throw forbidden('You cannot delete your own account.');

  const hasHistory = Object.values(member._count).some((count) => count > 0) || member.user?.lastLoginAt;
  if (hasHistory) {
    throw conflict('This member has activity history and cannot be deleted. Set their status to INACTIVE or ALUMNI instead.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.member.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: 'member.deleted',
      entityType: 'Member',
      entityId: id,
      metadata: { studentId: member.studentId, email: member.email },
    });
  });
  if (member.profileImageKey) await storage.remove(member.profileImageKey);
};

/**
 * Re-issues an invitation for accounts that never activated. For active
 * accounts it issues a password-reset link, which only holders of
 * roles:assign may do (otherwise a lower officer could take over a
 * higher one's account).
 */
export const issueAccessLink = async (memberId: string, actor: ActorContext & { userId: string }, canResetPasswords: boolean) => {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { user: { select: { id: true, status: true } } } });
  if (!member?.user) throw notFound('Member');
  const { user } = member;
  if (user.status === 'DISABLED') throw unprocessable('Enable this account before issuing a new link.');
  if (user.id === actor.userId) throw forbidden('Use "Change password" to update your own password.');

  const type = user.status === 'INVITED' ? 'INVITATION' : 'PASSWORD_RESET';
  if (type === 'PASSWORD_RESET' && !canResetPasswords) {
    throw forbidden('Only the adviser or the president can issue password-reset links for active accounts.');
  }

  return prisma.$transaction(async (tx) => {
    const link = await issueAccountToken(tx, user.id, type, actor.userId);
    await recordAudit(tx, actor, {
      action: type === 'INVITATION' ? 'user.invitation_issued' : 'user.password_reset_issued',
      entityType: 'User',
      entityId: user.id,
    });
    return { type, ...link };
  });
};

const assertNotLastPresident = async (tx: Prisma.TransactionClient, userId: string) => {
  const remaining = await tx.user.count({
    where: { role: { name: 'PRESIDENT' }, status: 'ACTIVE', id: { not: userId } },
  });
  if (remaining === 0) {
    throw unprocessable('The organization must always have at least one active president.', 'LAST_PRESIDENT');
  }
};

export const changeRole = async (memberId: string, role: RoleName, actor: ActorContext & { userId: string }) => {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { user: { select: { id: true, role: { select: { name: true } } } } },
  });
  if (!member?.user) throw notFound('Member');
  const { user } = member;
  if (user.id === actor.userId) throw forbidden('You cannot change your own role.');
  if (user.role.name === role) return getMember(memberId);

  await prisma.$transaction(
    async (tx) => {
      if (user.role.name === 'PRESIDENT') await assertNotLastPresident(tx, user.id);
      const target = await tx.role.findUniqueOrThrow({ where: { name: role } });
      await tx.user.update({ where: { id: user.id }, data: { roleId: target.id } });
      await recordAudit(tx, actor, {
        action: 'user.role_changed',
        entityType: 'User',
        entityId: user.id,
        metadata: { memberId, from: user.role.name, to: role },
      });
    },
    { isolationLevel: 'Serializable' },
  );
  return getMember(memberId);
};

export const changeAccountStatus = async (
  memberId: string,
  status: Extract<UserStatus, 'ACTIVE' | 'DISABLED'>,
  actor: ActorContext & { userId: string },
) => {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { user: { select: { id: true, status: true, passwordHash: true, role: { select: { name: true } } } } },
  });
  if (!member?.user) throw notFound('Member');
  const { user } = member;
  if (user.id === actor.userId) throw forbidden('You cannot change the status of your own account.');
  if (user.status === status) return getMember(memberId);
  if (status === 'ACTIVE' && !user.passwordHash) {
    throw unprocessable('This member has not accepted their invitation yet.');
  }

  await prisma.$transaction(
    async (tx) => {
      if (status === 'DISABLED' && user.role.name === 'PRESIDENT') await assertNotLastPresident(tx, user.id);
      await tx.user.update({ where: { id: user.id }, data: { status } });
      if (status === 'DISABLED') {
        await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await recordAudit(tx, actor, {
        action: 'user.status_changed',
        entityType: 'User',
        entityId: user.id,
        metadata: { memberId, from: user.status, to: status },
      });
    },
    { isolationLevel: 'Serializable' },
  );
  return getMember(memberId);
};

// ─── Profile image ─────────────────────────────────────────────────────────

export const setProfileImage = async (memberId: string, file: { buffer: Buffer; originalname: string }, actor: ActorContext) => {
  const stored = await storage.save('avatar', file);
  const before = await prisma.member.findUniqueOrThrow({ where: { id: memberId }, select: { profileImageKey: true } });
  await prisma.$transaction(async (tx) => {
    await tx.member.update({ where: { id: memberId }, data: { profileImageKey: stored.key } });
    await recordAudit(tx, actor, {
      action: 'member.updated',
      entityType: 'Member',
      entityId: memberId,
      metadata: { changes: { profileImage: { from: before.profileImageKey ? 'set' : null, to: 'updated' } } },
    });
  });
  if (before.profileImageKey) await storage.remove(before.profileImageKey);
};

export const getProfileImage = async (memberId: string) => {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { profileImageKey: true } });
  if (!member?.profileImageKey) throw notFound('Profile image');
  const ext = member.profileImageKey.split('.').pop();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { stream: storage.open(member.profileImageKey), mimeType: mime };
};
