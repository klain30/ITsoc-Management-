import { describe, expect, it } from 'vitest';

import { prisma } from '../src/lib/prisma.js';
import { api, auth, createEvent, createUser } from './helpers.js';

const inDays = (days: number, hours = 0) => new Date(Date.now() + days * 86_400_000 + hours * 3_600_000).toISOString();

describe('events', () => {
  it('validates and creates events, then publishes through the state machine', async () => {
    const secretary = await createUser('SECRETARY');
    const invalid = await api()
      .post('/api/v1/events')
      .set(auth(secretary))
      .send({ name: 'Bad', location: 'X', startsAt: inDays(5), endsAt: inDays(4), registrationDeadline: inDays(6), capacity: 0 });
    expect(invalid.status).toBe(400);
    expect(Object.keys(invalid.body.error.details.fieldErrors)).toEqual(expect.arrayContaining(['endsAt', 'capacity']));

    const created = await api()
      .post('/api/v1/events')
      .set(auth(secretary))
      .send({ name: 'Tech Talk', location: 'AVR', startsAt: inDays(5), endsAt: inDays(5, 2), registrationDeadline: inDays(4), capacity: 30 });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('DRAFT');

    const id = created.body.data.id as string;
    const skip = await api().patch(`/api/v1/events/${id}/status`).set(auth(secretary)).send({ status: 'COMPLETED' });
    expect(skip.status).toBe(422);
    const published = await api().patch(`/api/v1/events/${id}/status`).set(auth(secretary)).send({ status: 'PUBLISHED' });
    expect(published.body.data.status).toBe('PUBLISHED');
  });

  it('hides drafts from members', async () => {
    const secretary = await createUser('SECRETARY');
    const member = await createUser();
    const draft = await createEvent(secretary.userId, { status: 'DRAFT' });
    expect((await api().get(`/api/v1/events/${draft.id}`).set(auth(member))).status).toBe(404);
    const list = await api().get('/api/v1/events').set(auth(member));
    expect(list.body.data.map((e: { id: string }) => e.id)).not.toContain(draft.id);
  });

  it('prevents duplicate registrations and uses the token, not the body, for identity', async () => {
    const secretary = await createUser('SECRETARY');
    const member = await createUser();
    const other = await createUser();
    const event = await createEvent(secretary.userId);

    const first = await api().post(`/api/v1/events/${event.id}/register`).set(auth(member)).send({ memberId: other.memberId });
    expect(first.status).toBe(201);
    expect(first.body.data.memberId).toBe(member.memberId);

    const again = await api().post(`/api/v1/events/${event.id}/register`).set(auth(member));
    expect(again.status).toBe(409);
    expect(await prisma.eventRegistration.count({ where: { eventId: event.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: member.userId, type: 'EVENT_REGISTRATION_CONFIRMED' } })).toBe(1);
  });

  it('never exceeds capacity under concurrent registrations', async () => {
    const secretary = await createUser('SECRETARY');
    const event = await createEvent(secretary.userId, { capacity: 3 });
    const members = await Promise.all(Array.from({ length: 8 }, () => createUser()));

    const results = await Promise.all(members.map((m) => api().post(`/api/v1/events/${event.id}/register`).set(auth(m))));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 422)).toHaveLength(5);
    expect(await prisma.eventRegistration.count({ where: { eventId: event.id, status: 'REGISTERED' } })).toBe(3);
  });

  it('rejects registration after the deadline and for inactive members', async () => {
    const secretary = await createUser('SECRETARY');
    const alumni = await createUser('MEMBER', { status: 'ALUMNI' });
    const member = await createUser();
    const closing = await createEvent(secretary.userId, { startsInMs: 30 * 60 * 1000 }); // deadline was 30 min ago
    const open = await createEvent(secretary.userId);

    expect((await api().post(`/api/v1/events/${closing.id}/register`).set(auth(member))).body.error.code).toBe('REGISTRATION_CLOSED');
    expect((await api().post(`/api/v1/events/${open.id}/register`).set(auth(alumni))).status).toBe(422);
  });

  it('lets members cancel and re-register before the deadline', async () => {
    const secretary = await createUser('SECRETARY');
    const member = await createUser();
    const event = await createEvent(secretary.userId);
    await api().post(`/api/v1/events/${event.id}/register`).set(auth(member)).expect(201);
    await api().delete(`/api/v1/events/${event.id}/register`).set(auth(member)).expect(204);
    await api().post(`/api/v1/events/${event.id}/register`).set(auth(member)).expect(201);
  });

  it('does not allow capacity below the current registrations', async () => {
    const secretary = await createUser('SECRETARY');
    const event = await createEvent(secretary.userId);
    const members = await Promise.all([createUser(), createUser()]);
    for (const m of members) await api().post(`/api/v1/events/${event.id}/register`).set(auth(m)).expect(201);
    const res = await api().patch(`/api/v1/events/${event.id}`).set(auth(secretary)).send({ capacity: 1 });
    expect(res.status).toBe(422);
  });
});
