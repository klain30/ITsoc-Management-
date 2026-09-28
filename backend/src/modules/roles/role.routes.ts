import { RoleName } from '@prisma/client';
import { Router } from 'express';

import { PERMISSIONS } from '../../auth/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { authorizeAny } from '../../middleware/authorize.js';

const ROLE_ORDER = Object.values(RoleName);

/** Mounted at /roles. Read-only view of the permission matrix stored in the database. */
export const roleRouter = Router();

roleRouter.get('/', authorizeAny(PERMISSIONS.ROLES_ASSIGN, PERMISSIONS.MEMBERS_READ), async (_req, res) => {
  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      select: {
        name: true,
        description: true,
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { users: { where: { status: 'ACTIVE' } } } },
      },
    }),
    prisma.permission.findMany({ select: { key: true, description: true }, orderBy: { key: 'asc' } }),
  ]);
  res.json({
    data: {
      roles: roles
        .sort((a, b) => ROLE_ORDER.indexOf(a.name) - ROLE_ORDER.indexOf(b.name))
        .map((role) => ({
          name: role.name,
          description: role.description,
          activeUsers: role._count.users,
          permissions: role.permissions.map((p) => p.permission.key).sort(),
        })),
      permissions,
    },
  });
});
