import { Router } from 'express';

import { PERMISSIONS } from '../../auth/permissions.js';
import { actorContext, getAuth, hasPermission, param } from '../../common/request.js';
import { authorize } from '../../middleware/authorize.js';
import * as announcementService from './announcement.service.js';

/** Mounted at /announcements. */
export const announcementRouter = Router();

announcementRouter.get('/', async (req, res) => {
  const input = announcementService.listAnnouncementsSchema.parse(req.query);
  res.json(await announcementService.listAnnouncements(input, hasPermission(req, PERMISSIONS.ANNOUNCEMENTS_MANAGE)));
});

announcementRouter.post('/', authorize(PERMISSIONS.ANNOUNCEMENTS_MANAGE), async (req, res) => {
  const input = announcementService.createAnnouncementSchema.parse(req.body);
  const actor = { ...actorContext(req), userId: getAuth(req).userId };
  res.status(201).json({ data: await announcementService.createAnnouncement(input, actor) });
});

announcementRouter.get('/:id', async (req, res) => {
  res.json({ data: await announcementService.getAnnouncement(param(req, 'id'), hasPermission(req, PERMISSIONS.ANNOUNCEMENTS_MANAGE)) });
});

announcementRouter.patch('/:id', authorize(PERMISSIONS.ANNOUNCEMENTS_MANAGE), async (req, res) => {
  const input = announcementService.updateAnnouncementSchema.parse(req.body);
  res.json({ data: await announcementService.updateAnnouncement(param(req, 'id'), input, actorContext(req)) });
});

announcementRouter.patch('/:id/publish', authorize(PERMISSIONS.ANNOUNCEMENTS_MANAGE), async (req, res) => {
  res.json({ data: await announcementService.publishAnnouncement(param(req, 'id'), actorContext(req)) });
});

announcementRouter.patch('/:id/archive', authorize(PERMISSIONS.ANNOUNCEMENTS_MANAGE), async (req, res) => {
  res.json({ data: await announcementService.archiveAnnouncement(param(req, 'id'), actorContext(req)) });
});
