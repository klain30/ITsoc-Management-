import { Router } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../../auth/permissions.js';
import { paginationSchema } from '../../common/pagination.js';
import { authorize } from '../../middleware/authorize.js';
import { AUDIT_ACTIONS, listAuditLogs } from './audit.service.js';

const listSchema = paginationSchema.extend({
  action: z.enum(AUDIT_ACTIONS).optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(40).optional(),
  actorId: z.string().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Mounted at /audit-logs. Read-only by design: there is no write endpoint. */
export const auditRouter = Router();

auditRouter.get('/', authorize(PERMISSIONS.AUDIT_READ), async (req, res) => {
  res.json(await listAuditLogs(listSchema.parse(req.query)));
});

auditRouter.get('/actions', authorize(PERMISSIONS.AUDIT_READ), (_req, res) => {
  res.json({ data: AUDIT_ACTIONS });
});
