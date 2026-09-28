import { describe, expect, it } from 'vitest';

import { prisma } from '../src/lib/prisma.js';
import { api, auth, createEvent, createUser } from './helpers.js';

describe('audit log', () => {
  it('records officer actions and is append-only at the database level', async () => {
    const secretary = await createUser('SECRETARY');
    await api()
      .post('/api/v1/members')
      .set(auth(secretary))
      .send({ studentId: '2024-12345', firstName: 'Audit', lastName: 'Me', email: 'audit.me@test.local', course: 'BSIT', yearLevel: 1 })
      .expect(201);

    const entry = await prisma.auditLog.findFirstOrThrow({ where: { action: 'member.created' } });
    expect(entry.actorId).toBe(secretary.userId);

    await expect(prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'tampered' } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/);
  });

  it('records failed logins', async () => {
    await api().post('/api/v1/auth/login').send({ email: 'ghost@test.local', password: 'whatever123' });
    expect(await prisma.auditLog.count({ where: { action: 'auth.login_failed' } })).toBe(1);
  });

  it('is readable only with audit:read', async () => {
    const president = await createUser('PRESIDENT');
    const vp = await createUser('VICE_PRESIDENT');
    expect((await api().get('/api/v1/audit-logs').set(auth(president))).status).toBe(200);
    expect((await api().get('/api/v1/audit-logs').set(auth(vp))).status).toBe(403);
  });
});

describe('certificates', () => {
  const completedEventWithAttendance = async () => {
    const secretary = await createUser('SECRETARY');
    const attendee = await createUser();
    const absentee = await createUser();
    const event = await createEvent(secretary.userId, { status: 'COMPLETED', startsInMs: -48 * 3_600_000 });
    await prisma.attendance.createMany({
      data: [
        { eventId: event.id, memberId: attendee.memberId, status: 'LATE', source: 'QR', checkedInAt: new Date() },
        { eventId: event.id, memberId: absentee.memberId, status: 'ABSENT', source: 'SYSTEM' },
      ],
    });
    return { secretary, attendee, absentee, event };
  };

  it('issues only to attendees, idempotently, and notifies them', async () => {
    const { secretary, attendee, event } = await completedEventWithAttendance();
    const first = await api().post(`/api/v1/events/${event.id}/certificates`).set(auth(secretary));
    expect(first.body.data.issued).toBe(1);
    const second = await api().post(`/api/v1/events/${event.id}/certificates`).set(auth(secretary));
    expect(second.body.data.issued).toBe(0);
    expect(await prisma.notification.count({ where: { userId: attendee.userId, type: 'CERTIFICATE_AVAILABLE' } })).toBe(1);
  });

  it('refuses to issue for events that are not completed', async () => {
    const secretary = await createUser('SECRETARY');
    const event = await createEvent(secretary.userId);
    expect((await api().post(`/api/v1/events/${event.id}/certificates`).set(auth(secretary))).status).toBe(422);
  });

  it('lets the owner download a PDF but not other members', async () => {
    const { secretary, attendee, absentee, event } = await completedEventWithAttendance();
    await api().post(`/api/v1/events/${event.id}/certificates`).set(auth(secretary)).expect(201);
    const [certificate] = (await api().get('/api/v1/certificates/me').set(auth(attendee))).body.data;

    const pdf = await api().get(`/api/v1/certificates/${certificate.id}/download`).set(auth(attendee)).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    expect((await api().get(`/api/v1/certificates/${certificate.id}/download`).set(auth(absentee))).status).toBe(403);
  });

  it('public verification exposes no private data and reflects revocation', async () => {
    const { secretary, attendee, event } = await completedEventWithAttendance();
    await api().post(`/api/v1/events/${event.id}/certificates`).set(auth(secretary)).expect(201);
    const [certificate] = (await api().get('/api/v1/certificates/me').set(auth(attendee))).body.data;

    const verified = await api().get(`/api/v1/public/certificates/${certificate.code}`);
    expect(verified.status).toBe(200);
    expect(verified.body.data.status).toBe('VALID');
    expect(Object.keys(verified.body.data).sort()).toEqual(
      ['certificateId', 'dateIssued', 'event', 'eventDate', 'organization', 'recipientName', 'revokedAt', 'status'].sort(),
    );
    expect(JSON.stringify(verified.body)).not.toContain(attendee.email);

    await api()
      .patch(`/api/v1/certificates/${certificate.id}/revoke`)
      .set(auth(secretary))
      .send({ reason: 'Issued in error' })
      .expect(200);
    expect((await api().get(`/api/v1/public/certificates/${certificate.code}`)).body.data.status).toBe('REVOKED');
    expect((await api().get('/api/v1/public/certificates/ITSOC-0000-0000')).status).toBe(404);
  });
});
