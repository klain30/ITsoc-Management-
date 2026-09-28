import type { RoleName } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { syncRbac } from '../src/auth/rbac-sync.js';
import { prisma } from '../src/lib/prisma.js';

export const app = createApp();
export const api = () => request(app);

export const PASSWORD = 'CorrectHorse42';
// Low cost factor keeps tests fast; login verifies any bcrypt cost.
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

export const resetDatabase = async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  // TRUNCATE bypasses the row-level append-only triggers.
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await syncRbac(prisma);
  await prisma.organization.create({
    data: { id: 1, name: 'Information Technology Society', shortName: 'ITSoc', university: 'Test University' },
  });
};

let seq = 0;

export type TestUser = { userId: string; memberId: string; email: string; token: string };

/** Creates an ACTIVE member + account with the given role and signs in. */
export const createUser = async (role: RoleName = 'MEMBER', overrides: { status?: 'ACTIVE' | 'INACTIVE' | 'ALUMNI' } = {}) => {
  const n = ++seq;
  const email = `${role.toLowerCase()}${n}@test.local`;
  const roleRow = await prisma.role.findUniqueOrThrow({ where: { name: role } });
  const member = await prisma.member.create({
    data: {
      studentId: `TEST-${String(n).padStart(5, '0')}`,
      firstName: 'Test',
      lastName: `${role} ${n}`,
      email,
      course: 'BS Information Technology',
      yearLevel: 2,
      status: overrides.status ?? 'ACTIVE',
      user: { create: { roleId: roleRow.id, status: 'ACTIVE', passwordHash } },
    },
    include: { user: true },
  });
  const res = await api().post('/api/v1/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return {
    userId: member.user!.id,
    memberId: member.id,
    email,
    token: res.body.data.accessToken as string,
    cookie: res.headers['set-cookie'] as unknown as string[],
  };
};

export const auth = (user: { token: string }) => ({ Authorization: `Bearer ${user.token}` });

const hour = 60 * 60 * 1000;

/** Inserts an event directly (bypassing "must start in the future" so tests can build any scenario). */
export const createEvent = async (
  createdById: string,
  overrides: Partial<{ status: 'DRAFT' | 'PUBLISHED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'; capacity: number; startsInMs: number }> = {},
) => {
  const startsAt = new Date(Date.now() + (overrides.startsInMs ?? 48 * hour));
  return prisma.event.create({
    data: {
      name: `Event ${++seq}`,
      location: 'Room 101',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * hour),
      registrationDeadline: new Date(startsAt.getTime() - hour),
      capacity: overrides.capacity ?? 50,
      status: overrides.status ?? 'PUBLISHED',
      createdById,
    },
  });
};
