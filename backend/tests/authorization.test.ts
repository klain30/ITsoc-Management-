import { describe, expect, it } from 'vitest';

import { prisma } from '../src/lib/prisma.js';
import * as memberService from '../src/modules/members/member.service.js';
import { api, auth, createUser } from './helpers.js';

describe('role-based authorization (enforced by the API, not the UI)', () => {
  it('members cannot use officer endpoints', async () => {
    const member = await createUser('MEMBER');
    const checks = await Promise.all([
      api().get('/api/v1/members').set(auth(member)),
      api().post('/api/v1/events').set(auth(member)).send({}),
      api().get('/api/v1/budgets').set(auth(member)),
      api().get('/api/v1/audit-logs').set(auth(member)),
      api().patch('/api/v1/expenses/anything/approve').set(auth(member)),
    ]);
    for (const res of checks) expect(res.status).toBe(403);
  });

  it('the treasurer manages money but cannot approve expenses', async () => {
    const treasurer = await createUser('TREASURER');
    expect((await api().get('/api/v1/budgets').set(auth(treasurer))).status).toBe(200);
    expect((await api().patch('/api/v1/expenses/x/approve').set(auth(treasurer))).status).toBe(403);
  });

  it('the auditor can read finance but not change it', async () => {
    const auditor = await createUser('AUDITOR');
    expect((await api().get('/api/v1/expenses').set(auth(auditor))).status).toBe(200);
    expect((await api().post('/api/v1/budgets').set(auth(auditor)).send({ name: 'x', allocatedAmount: 1 })).status).toBe(403);
    expect((await api().post('/api/v1/expenses').set(auth(auditor)).send({})).status).toBe(403);
  });

  it('role changes take effect on the next request without re-login', async () => {
    const president = await createUser('PRESIDENT');
    const member = await createUser('MEMBER');
    expect((await api().get('/api/v1/members').set(auth(member))).status).toBe(403);

    const promoted = await api().patch(`/api/v1/members/${member.memberId}/role`).set(auth(president)).send({ role: 'SECRETARY' });
    expect(promoted.status).toBe(200);
    expect((await api().get('/api/v1/members').set(auth(member))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'user.role_changed' } })).toBe(1);
  });

  it('nobody can change their own role', async () => {
    const president = await createUser('PRESIDENT');
    const self = await api().patch(`/api/v1/members/${president.memberId}/role`).set(auth(president)).send({ role: 'MEMBER' });
    expect(self.status).toBe(403);
  });

  it('the last active president cannot be demoted or disabled', async () => {
    const president = await createUser('PRESIDENT');
    const other = await createUser('PRESIDENT');
    // Demoting one of two presidents is fine.
    await api().patch(`/api/v1/members/${other.memberId}/role`).set(auth(president)).send({ role: 'MEMBER' }).expect(200);

    // Through the API only a president can act, so the guard is defence in depth:
    // exercise it directly with an actor who is not the target.
    const actor = { userId: other.userId };
    await expect(memberService.changeRole(president.memberId, 'MEMBER', actor)).rejects.toMatchObject({ code: 'LAST_PRESIDENT' });
    await expect(memberService.changeAccountStatus(president.memberId, 'DISABLED', actor)).rejects.toMatchObject({
      code: 'LAST_PRESIDENT',
    });
  });

  it('a secretary cannot reset the password of an active officer', async () => {
    const secretary = await createUser('SECRETARY');
    const president = await createUser('PRESIDENT');
    const res = await api().post(`/api/v1/members/${president.memberId}/access-link`).set(auth(secretary));
    expect(res.status).toBe(403);
  });

  it('only the president can edit another officer or send them an account link', async () => {
    const president = await createUser('PRESIDENT');
    const secretary = await createUser('SECRETARY');
    const treasurer = await createUser('TREASURER');
    const member = await createUser('MEMBER');

    const hijack = await api().patch(`/api/v1/members/${president.memberId}`).set(auth(secretary)).send({ email: 'attacker@test.local' });
    expect(hijack.status).toBe(403);
    // A pending officer invitation cannot be re-issued (and claimed) by a lower officer.
    await prisma.user.update({ where: { id: treasurer.userId }, data: { status: 'INVITED' } });
    expect((await api().post(`/api/v1/members/${treasurer.memberId}/access-link`).set(auth(secretary))).status).toBe(403);

    // Regular members' records are still the secretary's job, and the president can edit officers.
    expect((await api().patch(`/api/v1/members/${member.memberId}`).set(auth(secretary)).send({ section: 'B' })).status).toBe(200);
    expect((await api().patch(`/api/v1/members/${secretary.memberId}`).set(auth(president)).send({ section: 'A' })).status).toBe(200);
  });

  it('members can view their own profile but not someone else’s', async () => {
    const a = await createUser();
    const b = await createUser();
    expect((await api().get(`/api/v1/members/${a.memberId}`).set(auth(a))).status).toBe(200);
    expect((await api().get(`/api/v1/members/${b.memberId}`).set(auth(a))).status).toBe(403);
  });

  it('users can only mark their own notifications as read', async () => {
    const a = await createUser();
    const b = await createUser();
    const note = await prisma.notification.create({
      data: { userId: b.userId, type: 'EVENT_REMINDER', title: 't', body: 'b' },
    });
    expect((await api().patch(`/api/v1/notifications/${note.id}/read`).set(auth(a))).status).toBe(404);
    expect((await api().patch(`/api/v1/notifications/${note.id}/read`).set(auth(b))).status).toBe(204);
  });
});
