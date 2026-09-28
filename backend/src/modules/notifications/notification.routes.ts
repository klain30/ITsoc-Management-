import { Router } from 'express';
import { z } from 'zod';

import { paginationSchema } from '../../common/pagination.js';
import { getAuth, param } from '../../common/request.js';
import * as notificationService from './notification.service.js';

const listSchema = paginationSchema.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

/** Mounted at /notifications. Always scoped to the signed-in user. */
export const notificationRouter = Router();

notificationRouter.get('/', async (req, res) => {
  res.json(await notificationService.listNotifications(getAuth(req).userId, listSchema.parse(req.query)));
});

notificationRouter.get('/unread-count', async (req, res) => {
  res.json({ data: { count: await notificationService.unreadCount(getAuth(req).userId) } });
});

notificationRouter.patch('/:id/read', async (req, res) => {
  await notificationService.markRead(getAuth(req).userId, param(req, 'id'));
  res.status(204).end();
});

notificationRouter.patch('/read-all', async (req, res) => {
  await notificationService.markAllRead(getAuth(req).userId);
  res.status(204).end();
});
