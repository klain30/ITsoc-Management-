import { describe, expect, it } from 'vitest';

import { api, auth, createUser } from './helpers.js';

const openDirect = (from: { token: string }, userId: string) =>
  api().post('/api/v1/chat/conversations/direct').set(auth(from)).send({ userId });

const send = (from: { token: string }, conversationId: string, body: string) =>
  api().post(`/api/v1/chat/conversations/${conversationId}/messages`).set(auth(from)).send({ body });

describe('chat', () => {
  it('reuses one direct conversation per pair and tracks unread messages', async () => {
    const president = await createUser('PRESIDENT');
    const secretary = await createUser('SECRETARY');

    const first = await openDirect(president, secretary.userId);
    expect(first.status).toBe(200);
    const again = await openDirect(secretary, president.userId);
    expect(again.body.data.id).toBe(first.body.data.id);
    const conversationId = first.body.data.id as string;

    expect((await send(president, conversationId, 'Meeting at 3?')).status).toBe(201);
    await send(president, conversationId, 'Room 204');

    const unread = await api().get('/api/v1/chat/unread-count').set(auth(secretary));
    expect(unread.body.data.count).toBe(2);
    // The sender has nothing unread.
    expect((await api().get('/api/v1/chat/unread-count').set(auth(president))).body.data.count).toBe(0);

    const history = await api().get(`/api/v1/chat/conversations/${conversationId}/messages`).set(auth(secretary));
    expect(history.body.data.map((m: { body: string }) => m.body)).toEqual(['Meeting at 3?', 'Room 204']);

    await api().post(`/api/v1/chat/conversations/${conversationId}/read`).set(auth(secretary)).expect(204);
    expect((await api().get('/api/v1/chat/unread-count').set(auth(secretary))).body.data.count).toBe(0);
  });

  it('lets members message officers but not other members', async () => {
    const member = await createUser('MEMBER');
    const otherMember = await createUser('MEMBER');
    const treasurer = await createUser('TREASURER');

    const contacts = await api().get('/api/v1/chat/contacts').set(auth(member));
    const ids = contacts.body.data.map((c: { userId: string }) => c.userId);
    expect(ids).toContain(treasurer.userId);
    expect(ids).not.toContain(otherMember.userId);

    expect((await openDirect(member, treasurer.userId)).status).toBe(200);
    expect((await openDirect(member, otherMember.userId)).status).toBe(422);
  });

  it('keeps conversations private to their participants', async () => {
    const president = await createUser('PRESIDENT');
    const vp = await createUser('VICE_PRESIDENT');
    const auditor = await createUser('AUDITOR');

    const conversation = await openDirect(president, vp.userId);
    const id = conversation.body.data.id as string;
    expect((await api().get(`/api/v1/chat/conversations/${id}/messages`).set(auth(auditor))).status).toBe(404);
    expect((await send(auditor, id, 'hello')).status).toBe(404);
  });

  it('creates groups, adds people, and removes leavers', async () => {
    const president = await createUser('PRESIDENT');
    const vp = await createUser('VICE_PRESIDENT');
    const secretary = await createUser('SECRETARY');
    const treasurer = await createUser('TREASURER');

    const group = await api()
      .post('/api/v1/chat/conversations/group')
      .set(auth(president))
      .send({ title: 'Officers', userIds: [vp.userId, secretary.userId] });
    expect(group.status).toBe(201);
    expect(group.body.data.participants).toHaveLength(3);
    const id = group.body.data.id as string;

    const added = await api().post(`/api/v1/chat/conversations/${id}/participants`).set(auth(vp)).send({ userIds: [treasurer.userId] });
    expect(added.body.data.participants).toHaveLength(4);

    await api().post(`/api/v1/chat/conversations/${id}/leave`).set(auth(secretary)).expect(204);
    expect((await send(secretary, id, 'still here?')).status).toBe(404);

    const history = await api().get(`/api/v1/chat/conversations/${id}/messages`).set(auth(treasurer));
    const kinds = history.body.data.map((m: { kind: string }) => m.kind);
    expect(kinds.every((kind: string) => kind === 'SYSTEM')).toBe(true);
    expect(history.body.data.at(-1).body).toMatch(/left the group/);
  });

  it('only lets authors remove their own messages', async () => {
    const president = await createUser('PRESIDENT');
    const vp = await createUser('VICE_PRESIDENT');
    const id = (await openDirect(president, vp.userId)).body.data.id as string;
    const message = await send(president, id, 'typo');

    expect((await api().delete(`/api/v1/chat/messages/${message.body.data.id}`).set(auth(vp))).status).toBe(403);
    await api().delete(`/api/v1/chat/messages/${message.body.data.id}`).set(auth(president)).expect(204);

    const history = await api().get(`/api/v1/chat/conversations/${id}/messages`).set(auth(vp));
    expect(history.body.data[0]).toMatchObject({ body: '', deletedAt: expect.any(String) });
  });
});
