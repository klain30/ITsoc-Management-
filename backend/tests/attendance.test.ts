import { describe, expect, it } from 'vitest';

import { prisma } from '../src/lib/prisma.js';
import { buildCheckInCode } from '../src/modules/attendance/qr-code.js';
import { api, auth, createEvent, createUser } from './helpers.js';

const setup = async () => {
  const secretary = await createUser('SECRETARY');
  const member = await createUser();
  // Started 5 minutes ago → check-ins are on time until start + 15 min.
  const event = await createEvent(secretary.userId, { startsInMs: -5 * 60 * 1000 });
  await prisma.eventRegistration.create({ data: { eventId: event.id, memberId: member.memberId } });
  const opened = await api().post(`/api/v1/events/${event.id}/attendance-sessions`).set(auth(secretary)).send({});
  expect(opened.status).toBe(201);
  const qr = await api().get(`/api/v1/attendance-sessions/${opened.body.data.id}/qr`).set(auth(secretary));
  return { secretary, member, event, sessionId: opened.body.data.id as string, code: qr.body.data.code as string };
};

describe('QR attendance', () => {
  it('opening a session moves a published event to ongoing and renders a QR image', async () => {
    const { secretary, event, sessionId } = await setup();
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('ONGOING');
    const qr = await api().get(`/api/v1/attendance-sessions/${sessionId}/qr`).set(auth(secretary));
    expect(qr.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(qr.body.data.url).toContain('/check-in?code=');
  });

  it('checks a registered member in once, on time', async () => {
    const { member, code } = await setup();
    const res = await api().post('/api/v1/attendance/check-in').set(auth(member)).send({ code });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PRESENT');

    const again = await api().post('/api/v1/attendance/check-in').set(auth(member)).send({ code });
    expect(again.status).toBe(409);
  });

  it('rejects unregistered members, tampered codes and expired codes', async () => {
    const { code, sessionId } = await setup();
    const stranger = await createUser();
    expect((await api().post('/api/v1/attendance/check-in').set(auth(stranger)).send({ code })).body.error.code).toBe('NOT_REGISTERED');

    const tampered = `${code.slice(0, -2)}xx`;
    expect((await api().post('/api/v1/attendance/check-in').set(auth(stranger)).send({ code: tampered })).body.error.code).toBe(
      'INVALID_CODE',
    );

    const session = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
    const old = buildCheckInCode(session.id, session.secret, Date.now() - 10 * 60 * 1000).code;
    expect((await api().post('/api/v1/attendance/check-in').set(auth(stranger)).send({ code: old })).body.error.code).toBe(
      'CODE_EXPIRED',
    );
  });

  it('refuses check-in after the session is closed', async () => {
    const { secretary, member, code, sessionId } = await setup();
    await api().patch(`/api/v1/attendance-sessions/${sessionId}/close`).set(auth(secretary)).expect(204);
    const res = await api().post('/api/v1/attendance/check-in').set(auth(member)).send({ code });
    expect(res.body.error.code).toBe('SESSION_CLOSED');
  });

  it('completing the event marks registered no-shows absent', async () => {
    const { secretary, event, member } = await setup();
    const noShow = await createUser();
    await prisma.eventRegistration.create({ data: { eventId: event.id, memberId: noShow.memberId } });

    await api().patch(`/api/v1/events/${event.id}/status`).set(auth(secretary)).send({ status: 'COMPLETED' }).expect(200);
    const records = await prisma.attendance.findMany({ where: { eventId: event.id } });
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.status === 'ABSENT' && r.source === 'SYSTEM')).toBe(true);
    expect(records.map((r) => r.memberId).sort()).toEqual([member.memberId, noShow.memberId].sort());
  });

  it('manual corrections require attendance:manage and a reason, and are audited', async () => {
    const { secretary, member, event } = await setup();
    const president = await createUser('PRESIDENT'); // can view attendance but not change it

    const denied = await api()
      .put(`/api/v1/events/${event.id}/attendance/${member.memberId}`)
      .set(auth(president))
      .send({ status: 'PRESENT', note: 'Was at the registration desk' });
    expect(denied.status).toBe(403);

    const noReason = await api()
      .put(`/api/v1/events/${event.id}/attendance/${member.memberId}`)
      .set(auth(secretary))
      .send({ status: 'PRESENT' });
    expect(noReason.status).toBe(400);

    const ok = await api()
      .put(`/api/v1/events/${event.id}/attendance/${member.memberId}`)
      .set(auth(secretary))
      .send({ status: 'PRESENT', note: 'Phone battery died; verified by ID' });
    expect(ok.status).toBe(200);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'attendance.updated' } });
    expect(log.metadata).toMatchObject({ to: 'PRESENT', note: 'Phone battery died; verified by ID' });
  });
});
