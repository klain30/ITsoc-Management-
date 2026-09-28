import crypto from 'node:crypto';

import { AccountTokenType, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { signAccessToken } from '../../auth/access-token.js';
import { unauthorized, unprocessable, AppError } from '../../common/errors.js';
import type { ActorContext } from '../../common/request.js';
import { env } from '../../config/env.js';
import { prisma, type Db } from '../../lib/prisma.js';
import { hashToken, randomToken } from '../../lib/tokens.js';
import { recordAudit } from '../audit/audit.service.js';

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
/** A rotated token presented again within this window is a benign race (two tabs), not theft. */
const ROTATION_GRACE_MS = 10 * 1000;

const TOKEN_TTL_MS: Record<AccountTokenType, number> = {
  INVITATION: 7 * 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 24 * 60 * 60 * 1000,
};

// Compared against when the email is unknown so response timing does not
// reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-password', BCRYPT_ROUNDS);

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);

const sessionUserSelect = {
  id: true,
  memberId: true,
  status: true,
  role: {
    select: {
      name: true,
      permissions: { select: { permission: { select: { key: true } } } },
    },
  },
  member: {
    select: {
      email: true,
      firstName: true,
      lastName: true,
      studentId: true,
      profileImageKey: true,
      positionAssignments: {
        where: { endDate: null },
        select: { position: { select: { name: true } } },
        take: 1,
      },
    },
  },
} satisfies Prisma.UserSelect;

type SessionUserRow = Prisma.UserGetPayload<{ select: typeof sessionUserSelect }>;

const toSessionUser = (user: SessionUserRow) => ({
  id: user.id,
  memberId: user.memberId,
  email: user.member.email,
  firstName: user.member.firstName,
  lastName: user.member.lastName,
  studentId: user.member.studentId,
  hasProfileImage: Boolean(user.member.profileImageKey),
  role: user.role.name,
  position: user.member.positionAssignments[0]?.position.name ?? null,
  permissions: user.role.permissions.map((entry) => entry.permission.key).sort(),
});

export type SessionUser = ReturnType<typeof toSessionUser>;

export type AuthResult = {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
};

const createRefreshToken = async (
  db: Db,
  userId: string,
  familyId: string,
  actor: Pick<ActorContext, 'ipAddress' | 'userAgent'>,
) => {
  const token = randomToken(48);
  const record = await db.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.refreshTokenTtlMs),
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    },
  });
  return { token, record };
};

const revokeFamily = (db: Db, familyId: string) =>
  db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });

const revokeAllForUser = (db: Db, userId: string) =>
  db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

const startSession = async (db: Db, userId: string, actor: ActorContext): Promise<AuthResult> => {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: sessionUserSelect });
  const { token } = await createRefreshToken(db, userId, crypto.randomUUID(), actor);
  return { user: toSessionUser(user), accessToken: signAccessToken(userId), refreshToken: token };
};

const invalidCredentials = () => unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');

export const login = async (email: string, password: string, actor: ActorContext): Promise<AuthResult> => {
  const member = await prisma.member.findUnique({
    where: { email },
    select: {
      user: { select: { id: true, passwordHash: true, status: true, lockedUntil: true, failedLoginAttempts: true } },
    },
  });
  const user = member?.user;

  if (!user?.passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH);
    await recordAudit(prisma, actor, {
      action: 'auth.login_failed',
      entityType: 'User',
      entityId: user?.id ?? null,
      metadata: { reason: user ? 'invitation_pending' : 'unknown_email' },
    });
    throw invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. This account is temporarily locked; try again later.');
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);

  if (!passwordOk) {
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: locked ? 0 : attempts,
          lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MS) : undefined,
        },
      }),
      recordAudit(prisma, { ...actor, userId: user.id }, {
        action: 'auth.login_failed',
        entityType: 'User',
        entityId: user.id,
        metadata: { reason: 'wrong_password', attempts, locked },
      }),
    ]);
    throw invalidCredentials();
  }

  if (user.status !== 'ACTIVE') {
    throw unauthorized('This account has been disabled. Contact an officer.', 'ACCOUNT_INACTIVE');
  }

  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await recordAudit(tx, { ...actor, userId: user.id }, { action: 'auth.login', entityType: 'User', entityId: user.id });
    return startSession(tx, user.id, actor);
  });
};

/**
 * Rotates a refresh token. Presenting an already-rotated token outside the
 * grace window means it was probably stolen, so the whole token family
 * (every session descended from that login) is revoked.
 */
export const refresh = async (presentedToken: string, actor: ActorContext) => {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(presentedToken) },
    include: { user: { select: { status: true } } },
  });

  if (!existing) {
    throw unauthorized('Session expired. Please sign in again.', 'INVALID_REFRESH_TOKEN');
  }

  if (existing.revokedAt) {
    // Only a token that was rotated (has a replacement) signals theft when
    // replayed; tokens revoked by logout or a family revocation just fail.
    const rotated = Boolean(existing.replacedById);
    const withinGrace = Date.now() - existing.revokedAt.getTime() < ROTATION_GRACE_MS;
    if (rotated && withinGrace) {
      // Another tab rotated this token a moment ago; the browser already has
      // the new cookie, so the client should simply retry.
      throw unauthorized('Session was just refreshed. Retry the request.', 'REFRESH_RACE');
    }
    if (rotated) {
      await prisma.$transaction([
        revokeFamily(prisma, existing.familyId),
        recordAudit(prisma, { ...actor, userId: existing.userId }, {
          action: 'auth.refresh_token_reuse',
          entityType: 'User',
          entityId: existing.userId,
          metadata: { familyId: existing.familyId },
        }),
      ]);
    }
    throw unauthorized('Session expired. Please sign in again.', 'INVALID_REFRESH_TOKEN');
  }

  if (existing.expiresAt < new Date() || existing.user.status !== 'ACTIVE') {
    await revokeFamily(prisma, existing.familyId);
    throw unauthorized('Session expired. Please sign in again.', 'INVALID_REFRESH_TOKEN');
  }

  return prisma.$transaction(async (tx) => {
    // Conditional update so two concurrent rotations cannot both succeed.
    const { token, record } = await createRefreshToken(tx, existing.userId, existing.familyId, actor);
    const claimed = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: record.id },
    });
    if (claimed.count === 0) {
      throw unauthorized('Session expired. Please sign in again.', 'INVALID_REFRESH_TOKEN');
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: existing.userId }, select: sessionUserSelect });
    return { user: toSessionUser(user), accessToken: signAccessToken(existing.userId), refreshToken: token };
  });
};

export const logout = async (presentedToken: string | undefined, actor: ActorContext) => {
  if (!presentedToken) return;
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(presentedToken) } });
  if (!existing) return;
  await prisma.$transaction([
    revokeFamily(prisma, existing.familyId),
    recordAudit(prisma, { ...actor, userId: existing.userId }, {
      action: 'auth.logout',
      entityType: 'User',
      entityId: existing.userId,
    }),
  ]);
};

export const getSessionUser = async (userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: sessionUserSelect });
  return toSessionUser(user);
};

// ─── Invitations & password resets ──────────────────────────────────────────

/**
 * Creates a single-use account token (invalidating older unused ones of the
 * same type) and returns the link the member should open.
 */
export const issueAccountToken = async (db: Db, userId: string, type: AccountTokenType, createdById: string) => {
  const now = new Date();
  await db.accountToken.updateMany({
    where: { userId, type, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
  const token = randomToken(32);
  const record = await db.accountToken.create({
    data: {
      userId,
      type,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[type]),
      createdById,
    },
  });
  return { link: `${env.appUrl}/set-password?token=${token}`, expiresAt: record.expiresAt };
};

const findUsableAccountToken = async (token: string) => {
  const record = await prisma.accountToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { select: { id: true, status: true, member: { select: { email: true, firstName: true, lastName: true } } } },
    },
  });
  if (!record || record.usedAt || record.expiresAt < new Date() || record.user.status === 'DISABLED') {
    throw unprocessable('This link is invalid or has expired. Ask an officer for a new one.', 'INVALID_ACCOUNT_TOKEN');
  }
  return record;
};

export const previewAccountToken = async (token: string) => {
  const record = await findUsableAccountToken(token);
  return {
    type: record.type,
    email: record.user.member.email,
    firstName: record.user.member.firstName,
    expiresAt: record.expiresAt,
  };
};

/** Completes an invitation or password reset and signs the user in. */
export const setPasswordWithToken = async (token: string, password: string, actor: ActorContext) => {
  const record = await findUsableAccountToken(token);
  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.accountToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw unprocessable('This link has already been used.', 'INVALID_ACCOUNT_TOKEN');
    }

    // Truncate to whole seconds so tokens issued right after this still pass
    // the "issued after password change" check (JWT iat has second precision).
    const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        status: 'ACTIVE',
        passwordChangedAt: changedAt,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
    await revokeAllForUser(tx, record.userId);
    await recordAudit(tx, { ...actor, userId: record.userId }, {
      action: record.type === 'INVITATION' ? 'auth.invitation_accepted' : 'auth.password_changed',
      entityType: 'User',
      entityId: record.userId,
      metadata: { via: record.type },
    });
    return startSession(tx, record.userId, actor);
  });
};

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
  actor: ActorContext,
): Promise<AuthResult> => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw unprocessable('Current password is incorrect.', 'INVALID_CREDENTIALS');
  }
  const passwordHash = await hashPassword(newPassword);

  return prisma.$transaction(async (tx) => {
    const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: changedAt } });
    // Sign out every other device.
    await revokeAllForUser(tx, userId);
    await recordAudit(tx, actor, { action: 'auth.password_changed', entityType: 'User', entityId: userId, metadata: { via: 'self' } });
    return startSession(tx, userId, actor);
  });
};
