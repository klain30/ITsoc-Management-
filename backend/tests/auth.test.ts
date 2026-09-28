import { describe, expect, it } from 'vitest';

import { prisma } from '../src/lib/prisma.js';
import { api, auth, createUser, PASSWORD } from './helpers.js';

const cookieValue = (setCookie: string[] | undefined) => setCookie?.find((c) => c.startsWith('itsoc_rt='))?.split(';')[0];

describe('authentication', () => {
  it('logs in, sets an httpOnly refresh cookie, and never returns password data', async () => {
    const user = await createUser('SECRETARY');
    const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTypeOf('string');
    expect(res.body.data.user.permissions).toContain('attendance:manage');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    const cookie = res.headers['set-cookie'] as unknown as string[];
    expect(cookie.join(';')).toMatch(/itsoc_rt=.*HttpOnly/i);
    expect(cookie.join(';')).toMatch(/SameSite=Strict/i);
  });

  it('rejects bad credentials with a generic message', async () => {
    const user = await createUser();
    const wrongPassword = await api().post('/api/v1/auth/login').send({ email: user.email, password: 'wrong-password1' });
    const unknownEmail = await api().post('/api/v1/auth/login').send({ email: 'nobody@test.local', password: 'wrong-password1' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('locks the account after repeated failures', async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i += 1) {
      await api().post('/api/v1/auth/login').send({ email: user.email, password: 'wrong-password1' });
    }
    const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('requires a bearer token on protected routes', async () => {
    expect((await api().get('/api/v1/auth/me')).status).toBe(401);
    expect((await api().get('/api/v1/events').set('Authorization', 'Bearer not-a-jwt')).status).toBe(401);
  });

  it('rotates refresh tokens and revokes the family when an old token is replayed', async () => {
    const user = await createUser();
    const first = cookieValue(user.cookie)!;

    const rotated = await api().post('/api/v1/auth/refresh').set('Cookie', first).set('X-Requested-With', 'XMLHttpRequest');
    expect(rotated.status).toBe(200);
    const second = cookieValue(rotated.headers['set-cookie'] as unknown as string[])!;
    expect(second).not.toBe(first);

    // Pretend the first token was rotated long ago, then replay it (theft scenario).
    await prisma.refreshToken.updateMany({
      where: { userId: user.userId, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    const replay = await api().post('/api/v1/auth/refresh').set('Cookie', first).set('X-Requested-With', 'XMLHttpRequest');
    expect(replay.status).toBe(401);

    // The legitimate token from the same family is now revoked too.
    const afterReplay = await api().post('/api/v1/auth/refresh').set('Cookie', second).set('X-Requested-With', 'XMLHttpRequest');
    expect(afterReplay.status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: 'auth.refresh_token_reuse' } })).toBe(1);
  });

  it('treats an immediate replay (two tabs refreshing at once) as a benign race, not theft', async () => {
    const user = await createUser();
    const first = cookieValue(user.cookie)!;
    const rotated = await api().post('/api/v1/auth/refresh').set('Cookie', first).set('X-Requested-With', 'XMLHttpRequest');
    const second = cookieValue(rotated.headers['set-cookie'] as unknown as string[])!;

    const race = await api().post('/api/v1/auth/refresh').set('Cookie', first).set('X-Requested-With', 'XMLHttpRequest');
    expect(race.status).toBe(401);
    expect(race.body.error.code).toBe('REFRESH_RACE');
    // The cookie is not cleared and the newer token still works.
    expect(race.headers['set-cookie']).toBeUndefined();
    const ok = await api().post('/api/v1/auth/refresh').set('Cookie', second).set('X-Requested-With', 'XMLHttpRequest');
    expect(ok.status).toBe(200);
  });

  it('refuses refresh without the CSRF header', async () => {
    const user = await createUser();
    const res = await api().post('/api/v1/auth/refresh').set('Cookie', cookieValue(user.cookie)!);
    expect(res.status).toBe(400);
  });

  it('logout revokes the session', async () => {
    const user = await createUser();
    const cookie = cookieValue(user.cookie)!;
    await api().post('/api/v1/auth/logout').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest').expect(204);
    const res = await api().post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest');
    expect(res.status).toBe(401);
  });

  it('blocks disabled accounts immediately, even with a valid access token', async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.userId }, data: { status: 'DISABLED' } });
    const res = await api().get('/api/v1/auth/me').set(auth(user));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('invites a member who then sets a password and signs in', async () => {
    const secretary = await createUser('SECRETARY');
    const created = await api()
      .post('/api/v1/members')
      .set(auth(secretary))
      .send({
        studentId: '2024-00077',
        firstName: 'Nina',
        lastName: 'Reyes',
        email: 'Nina.Reyes@Test.Local',
        course: 'BS Computer Science',
        yearLevel: 1,
        contactNumber: '0917 123 4567',
      });
    expect(created.status).toBe(201);
    expect(created.body.data.member.email).toBe('nina.reyes@test.local');
    expect(created.body.data.member.contactNumber).toBe('+639171234567');
    expect(created.body.data.member.account.status).toBe('INVITED');

    const token = new URL(created.body.data.invitation.link).searchParams.get('token')!;
    const preview = await api().get(`/api/v1/auth/account-tokens/${token}`);
    expect(preview.body.data).toMatchObject({ type: 'INVITATION', email: 'nina.reyes@test.local' });

    const weak = await api().post('/api/v1/auth/set-password').send({ token, password: 'short' });
    expect(weak.status).toBe(400);

    const accepted = await api().post('/api/v1/auth/set-password').send({ token, password: 'ANewPassword9' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.user.role).toBe('MEMBER');

    const reused = await api().post('/api/v1/auth/set-password').send({ token, password: 'ANewPassword9' });
    expect(reused.status).toBe(422);
  });

  it('invalidates older access tokens after a password change', async () => {
    const user = await createUser();
    // Access tokens have 1-second resolution; make sure the change happens in a later second.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const changed = await api()
      .post('/api/v1/auth/change-password')
      .set(auth(user))
      .send({ currentPassword: PASSWORD, newPassword: 'BrandNewPass77' });
    expect(changed.status).toBe(200);

    expect((await api().get('/api/v1/auth/me').set(auth(user))).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set(auth({ token: changed.body.data.accessToken }))).status).toBe(200);
  });
});
