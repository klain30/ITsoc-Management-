import { RoleName, type PrismaClient } from '@prisma/client';

import { PERMISSION_DESCRIPTIONS, ROLE_DESCRIPTIONS, ROLE_PERMISSIONS, type Permission } from './permissions.js';

/**
 * Makes the Role / Permission / RolePermission tables match permissions.ts.
 * Idempotent; safe to run on every deploy.
 */
export const syncRbac = async (prisma: PrismaClient) => {
  const permissionIds = new Map<Permission, string>();
  for (const [key, description] of Object.entries(PERMISSION_DESCRIPTIONS) as [Permission, string][]) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
    permissionIds.set(key, permission.id);
  }

  for (const name of Object.values(RoleName)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description: ROLE_DESCRIPTIONS[name] },
      create: { name, description: ROLE_DESCRIPTIONS[name] },
    });
    const wanted = ROLE_PERMISSIONS[name].map((key) => permissionIds.get(key)!);
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { notIn: wanted } } }),
      prisma.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
  }

  // Drop permissions that no longer exist in code.
  await prisma.permission.deleteMany({ where: { key: { notIn: [...permissionIds.keys()] } } });
};
