/**
 * Idempotent reference data, run on every deploy (see Dockerfile):
 *   - syncs roles and permissions from src/auth/permissions.ts
 *   - creates the organization profile and default positions if missing
 *   - optionally creates the first president (when none exists yet) and
 *     prints a one-time invitation link to the logs
 *
 *   node dist/scripts/bootstrap.js
 *
 * First-president variables (all required together):
 *   BOOTSTRAP_PRESIDENT_EMAIL, BOOTSTRAP_PRESIDENT_FIRST_NAME,
 *   BOOTSTRAP_PRESIDENT_LAST_NAME, BOOTSTRAP_PRESIDENT_STUDENT_ID
 */
import { pathToFileURL } from 'node:url';

import type { PrismaClient } from '@prisma/client';

import { syncRbac } from '../auth/rbac-sync.js';

const DEFAULT_POSITIONS = [
  { name: 'President', sortOrder: 10 },
  { name: 'Vice President', sortOrder: 20 },
  { name: 'Secretary', sortOrder: 30 },
  { name: 'Treasurer', sortOrder: 40 },
  { name: 'Auditor', sortOrder: 50 },
  { name: 'Public Relations Officer', sortOrder: 60 },
  { name: 'Committee Head', sortOrder: 70 },
  { name: 'Committee Member', sortOrder: 80 },
];

export const seedReferenceData = async (prisma: PrismaClient) => {
  await syncRbac(prisma);
  await prisma.organization.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: process.env.ORG_NAME ?? 'Information Technology Society',
      shortName: process.env.ORG_SHORT_NAME ?? 'ITSoc',
      university: process.env.ORG_UNIVERSITY ?? 'College of Computing and Information Sciences',
    },
  });
  for (const position of DEFAULT_POSITIONS) {
    await prisma.position.upsert({ where: { name: position.name }, update: {}, create: position });
  }
};

/** Creates the first president as an INVITED account; returns the invitation link. */
export const bootstrapPresident = async (prisma: PrismaClient) => {
  const email = process.env.BOOTSTRAP_PRESIDENT_EMAIL?.trim().toLowerCase();
  const firstName = process.env.BOOTSTRAP_PRESIDENT_FIRST_NAME?.trim();
  const lastName = process.env.BOOTSTRAP_PRESIDENT_LAST_NAME?.trim();
  const studentId = process.env.BOOTSTRAP_PRESIDENT_STUDENT_ID?.trim().toUpperCase();
  if (!email || !firstName || !lastName || !studentId) return null;

  const existing = await prisma.user.count({ where: { role: { name: 'PRESIDENT' } } });
  if (existing > 0) return null;

  // Imported lazily: these read env configuration that plain seeding does not need.
  const { issueAccountToken } = await import('../modules/auth/auth.service.js');
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'PRESIDENT' } });

  return prisma.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        email,
        firstName,
        lastName,
        studentId,
        course: 'To be updated',
        yearLevel: 1,
        user: { create: { roleId: role.id, status: 'INVITED' } },
      },
      include: { user: true },
    });
    const { link } = await issueAccountToken(tx, member.user!.id, 'INVITATION', member.user!.id);
    return link;
  });
};

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
  const { prisma } = await import('../lib/prisma.js');
  try {
    await seedReferenceData(prisma);
    console.warn('Reference data synced (roles, permissions, organization, positions).');
    const link = await bootstrapPresident(prisma);
    if (link) console.warn(`First president created. Invitation link (valid 7 days, single use):\n${link}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
