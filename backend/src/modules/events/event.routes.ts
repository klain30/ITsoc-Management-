import { Router, type Request } from 'express';

import { PERMISSIONS } from '../../auth/permissions.js';
import { actorContext, getAuth, hasPermission, param } from '../../common/request.js';
import { authorize, authorizeAny } from '../../middleware/authorize.js';
import { changeEventStatusSchema, createEventSchema, listEventsSchema, updateEventSchema } from './event.schemas.js';
import * as eventService from './event.service.js';

const viewer = (req: Request): eventService.EventViewer => ({
  memberId: getAuth(req).memberId,
  canManage: hasPermission(req, PERMISSIONS.EVENTS_MANAGE),
});

/** Mounted at /events. */
export const eventRouter = Router();

eventRouter.get('/', async (req, res) => {
  res.json(await eventService.listEvents(listEventsSchema.parse(req.query), viewer(req)));
});

eventRouter.post('/', authorize(PERMISSIONS.EVENTS_MANAGE), async (req, res) => {
  const actor = { ...actorContext(req), userId: getAuth(req).userId };
  res.status(201).json({ data: await eventService.createEvent(createEventSchema.parse(req.body), actor) });
});

eventRouter.get('/:id', async (req, res) => {
  res.json({ data: await eventService.getEvent(param(req, 'id'), viewer(req)) });
});

eventRouter.patch('/:id', authorize(PERMISSIONS.EVENTS_MANAGE), async (req, res) => {
  res.json({ data: await eventService.updateEvent(param(req, 'id'), updateEventSchema.parse(req.body), actorContext(req)) });
});

eventRouter.patch('/:id/status', authorize(PERMISSIONS.EVENTS_MANAGE), async (req, res) => {
  const { status } = changeEventStatusSchema.parse(req.body);
  res.json({ data: await eventService.changeEventStatus(param(req, 'id'), status, actorContext(req)) });
});

// Self-service registration: the member id always comes from the token, never the body.
eventRouter.post('/:id/register', async (req, res) => {
  const registration = await eventService.registerForEvent(param(req, 'id'), getAuth(req).memberId);
  res.status(201).json({ data: registration });
});

eventRouter.delete('/:id/register', async (req, res) => {
  await eventService.cancelRegistration(param(req, 'id'), getAuth(req).memberId);
  res.status(204).end();
});

eventRouter.get('/:id/registrations', authorizeAny(PERMISSIONS.EVENTS_MANAGE, PERMISSIONS.ATTENDANCE_READ), async (req, res) => {
  res.json({ data: await eventService.listRegistrations(param(req, 'id')) });
});
