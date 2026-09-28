import { Router } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../../auth/permissions.js';
import { actorContext } from '../../common/request.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { diffFields, recordAudit } from '../audit/audit.service.js';
import { getOrganization, organizationSelect } from './organization.service.js';

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    shortName: z.string().trim().min(2).max(20),
    university: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254).nullable(),
  })
  .partial()
  .strict();

/** Mounted at /organization. Public GET: the name is shown on the login and verification pages. */
export const organizationRouter = Router();

organizationRouter.get('/', async (_req, res) => {
  res.json({ data: await getOrganization() });
});

organizationRouter.patch('/', authenticate, authorize(PERMISSIONS.ROLES_ASSIGN), async (req, res) => {
  const input = updateSchema.parse(req.body);
  const before = await getOrganization();
  const updated = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.update({ where: { id: 1 }, data: input, select: organizationSelect });
    await recordAudit(tx, actorContext(req), {
      action: 'organization.updated',
      entityType: 'Organization',
      entityId: '1',
      metadata: { changes: diffFields(before, input) },
    });
    return organization;
  });
  res.json({ data: updated });
});
