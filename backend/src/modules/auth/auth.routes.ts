import { Router, type CookieOptions, type Request, type RequestHandler, type Response } from 'express';

import { AppError, badRequest } from '../../common/errors.js';
import { actorContext, getAuth, param } from '../../common/request.js';
import { env } from '../../config/env.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authIpRateLimit, authRateLimit, refreshRateLimit } from '../../middleware/rate-limit.js';
import * as authService from './auth.service.js';
import { changePasswordSchema, loginSchema, setPasswordSchema } from './auth.schemas.js';

export const REFRESH_COOKIE = 'itsoc_rt';

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'strict',
  path: '/api/v1/auth',
};

const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, { ...refreshCookieOptions, maxAge: env.refreshTokenTtlMs });

const readRefreshCookie = (req: Request): string | undefined => {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/**
 * Cookie-authenticated endpoints additionally require a custom header.
 * Browsers cannot send custom headers cross-site without a CORS preflight,
 * which our CORS policy refuses — a second line of CSRF defence on top of
 * SameSite=Strict.
 */
const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (req.get('x-requested-with') !== 'XMLHttpRequest') {
    throw badRequest('Missing X-Requested-With header.');
  }
  next();
};

const sendAuthResult = (res: Response, result: authService.AuthResult, status = 200) => {
  setRefreshCookie(res, result.refreshToken);
  res.status(status).json({ data: { user: result.user, accessToken: result.accessToken } });
};

const router = Router();

router.post('/login', authIpRateLimit, authRateLimit, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  sendAuthResult(res, await authService.login(email, password, actorContext(req)));
});

router.post('/refresh', refreshRateLimit, requireCsrfHeader, async (req, res) => {
  const token = readRefreshCookie(req);
  if (!token) {
    res.status(401).json({ error: { code: 'NO_SESSION', message: 'No active session.' } });
    return;
  }
  try {
    sendAuthResult(res, await authService.refresh(token, actorContext(req)));
  } catch (error) {
    // On a benign two-tab race the browser already holds the new cookie; keep it.
    if (!(error instanceof AppError && error.code === 'REFRESH_RACE')) {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
    }
    throw error;
  }
});

router.post('/logout', requireCsrfHeader, async (req, res) => {
  await authService.logout(readRefreshCookie(req), actorContext(req));
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  res.status(204).end();
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ data: await authService.getSessionUser(getAuth(req).userId) });
});

router.post('/change-password', authenticate, authRateLimit, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const result = await authService.changePassword(getAuth(req).userId, currentPassword, newPassword, actorContext(req));
  sendAuthResult(res, result);
});

// Invitation / password-reset links
router.get('/account-tokens/:token', authRateLimit, async (req, res) => {
  res.json({ data: await authService.previewAccountToken(param(req, 'token')) });
});

router.post('/set-password', authRateLimit, async (req, res) => {
  const { token, password } = setPasswordSchema.parse(req.body);
  sendAuthResult(res, await authService.setPasswordWithToken(token, password, actorContext(req)));
});

export default router;
