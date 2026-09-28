import { prisma } from '../../lib/prisma.js';

export const organizationSelect = { name: true, shortName: true, university: true, email: true } as const;

export const getOrganization = () => prisma.organization.findUniqueOrThrow({ where: { id: 1 }, select: organizationSelect });
