import { Router } from 'express';
import { z } from 'zod';

import { searchSchema } from '../../common/pagination.js';
import { getAuth, param } from '../../common/request.js';
import * as chatService from './chat.service.js';

const id = z.string().trim().min(1).max(64);
const title = z.string().trim().min(1, 'Give the group a name.').max(80);
const userIds = z.array(id).min(1).max(50);

const directSchema = z.object({ userId: id });
const groupSchema = z.object({ title, userIds });
const renameSchema = z.object({ title });
const addSchema = z.object({ userIds });
const messageSchema = z.object({ body: z.string().trim().min(1, 'Write a message first.').max(4000) });
const historySchema = z.object({
  before: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

/**
 * Mounted at /chat. Any signed-in user can chat; who they can reach is
 * decided in chat.service (officers reach everyone, members reach officers).
 * Every conversation route checks that the caller is a participant.
 */
export const chatRouter = Router();

chatRouter.get('/contacts', async (req, res) => {
  const search = searchSchema.parse(req.query.search);
  res.json({ data: await chatService.listContacts(getAuth(req), search) });
});

chatRouter.get('/unread-count', async (req, res) => {
  res.json({ data: { count: await chatService.totalUnread(getAuth(req).userId) } });
});

chatRouter.get('/conversations', async (req, res) => {
  res.json({ data: await chatService.listConversations(getAuth(req).userId) });
});

chatRouter.post('/conversations/direct', async (req, res) => {
  const { userId } = directSchema.parse(req.body);
  res.json({ data: await chatService.openDirect(getAuth(req), userId) });
});

chatRouter.post('/conversations/group', async (req, res) => {
  res.status(201).json({ data: await chatService.createGroup(getAuth(req), groupSchema.parse(req.body)) });
});

chatRouter.get('/conversations/:id', async (req, res) => {
  res.json({ data: await chatService.getConversation(getAuth(req).userId, param(req, 'id')) });
});

chatRouter.patch('/conversations/:id', async (req, res) => {
  const { title: newTitle } = renameSchema.parse(req.body);
  res.json({ data: await chatService.renameGroup(getAuth(req), param(req, 'id'), newTitle) });
});

chatRouter.post('/conversations/:id/participants', async (req, res) => {
  const body = addSchema.parse(req.body);
  res.json({ data: await chatService.addParticipants(getAuth(req), param(req, 'id'), body.userIds) });
});

chatRouter.post('/conversations/:id/leave', async (req, res) => {
  await chatService.leaveGroup(getAuth(req), param(req, 'id'));
  res.status(204).end();
});

chatRouter.get('/conversations/:id/messages', async (req, res) => {
  res.json(await chatService.listMessages(getAuth(req).userId, param(req, 'id'), historySchema.parse(req.query)));
});

chatRouter.post('/conversations/:id/messages', async (req, res) => {
  const { body } = messageSchema.parse(req.body);
  res.status(201).json({ data: await chatService.sendMessage(getAuth(req).userId, param(req, 'id'), body) });
});

chatRouter.post('/conversations/:id/read', async (req, res) => {
  await chatService.markRead(getAuth(req).userId, param(req, 'id'));
  res.status(204).end();
});

chatRouter.delete('/messages/:id', async (req, res) => {
  await chatService.deleteMessage(getAuth(req).userId, param(req, 'id'));
  res.status(204).end();
});
