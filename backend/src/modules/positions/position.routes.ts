import { Router } from 'express';

import { PERMISSIONS } from '../../auth/permissions.js';
import { actorContext, getAuth, hasPermission, param } from '../../common/request.js';
import { authorize } from '../../middleware/authorize.js';
import * as positionService from './position.service.js';

/** Mounted at /positions. */
export const positionRouter = Router();

positionRouter.get('/', authorize(PERMISSIONS.MEMBERS_READ), async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true' && hasPermission(req, PERMISSIONS.POSITIONS_MANAGE);
  res.json({ data: await positionService.listPositions(includeInactive) });
});

positionRouter.post('/', authorize(PERMISSIONS.POSITIONS_MANAGE), async (req, res) => {
  const input = positionService.positionInputSchema.parse(req.body);
  res.status(201).json({ data: await positionService.createPosition(input, actorContext(req)) });
});

positionRouter.patch('/:id', authorize(PERMISSIONS.POSITIONS_MANAGE), async (req, res) => {
  const input = positionService.updatePositionSchema.parse(req.body);
  res.json({ data: await positionService.updatePosition(param(req, 'id'), input, actorContext(req)) });
});

positionRouter.post('/:id/assignments', authorize(PERMISSIONS.POSITIONS_MANAGE), async (req, res) => {
  const input = positionService.assignPositionSchema.parse(req.body);
  const actor = { ...actorContext(req), userId: getAuth(req).userId };
  res.status(201).json({ data: await positionService.assignPosition(param(req, 'id'), input, actor) });
});

/** Mounted at /position-assignments. */
export const assignmentRouter = Router();

assignmentRouter.patch('/:id/end', authorize(PERMISSIONS.POSITIONS_MANAGE), async (req, res) => {
  const { endDate } = positionService.endAssignmentSchema.parse(req.body);
  res.json({ data: await positionService.endAssignment(param(req, 'id'), endDate, actorContext(req)) });
});
