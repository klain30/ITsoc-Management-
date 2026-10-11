import crypto from 'node:crypto';

import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { env } from '../config/env.js';

const tooMany = (message: string) => ({ error: { code: 'RATE_LIMITED', message } });
const ip = (req: Request) => ipKeyGenerator(req.ip ?? '0.0.0.0');

/*
 * Students on campus Wi-Fi share one public IP, so per-IP limits alone
 * would let one busy event lock everyone out. Credential and session
 * limits are therefore keyed by account / session, with only a loose
 * per-IP ceiling against password spraying.
 */

/** Failed sign-ins per account (IP + email): stops guessing one account's password. */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${ip(req)}:${email}`;
  },
  message: tooMany('Too many attempts. Please wait a few minutes and try again.'),
});

/** Failed sign-ins per IP across all accounts: stops spraying one password across many accounts. */
export const authIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: ip,
  message: tooMany('Too many failed sign-ins from this network. Please try again later.'),
});

/** Refreshes per session (keyed by a hash of the refresh cookie, falling back to IP). */
export const refreshRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: env.isTest ? 1000 : 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const token: unknown = req.cookies?.itsoc_rt;
    return typeof token === 'string' && token
      ? `rt:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`
      : `ip:${ip(req)}`;
  },
  message: tooMany('Too many session refreshes. Please slow down.'),
});

/** Public, unauthenticated endpoints (certificate verification). */
export const publicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: env.isTest ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ip,
  message: tooMany('Too many requests. Please try again shortly.'),
});

/** Generous per-IP ceiling for the whole API (sized for a shared campus network). */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: env.isTest ? 10_000 : 2000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ip,
  message: tooMany('Too many requests. Please try again shortly.'),
});

/**
 * Chat writes per signed-in user (sending messages, creating groups): stops one
 * account from flooding conversations. Mounted after authenticate(), so req.auth is set.
 */
export const chatWriteRateLimit = rateLimit({
  windowMs: 10 * 1000,
  limit: env.isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.auth?.userId ?? ip(req)}`,
  message: tooMany('You are sending messages too quickly. Please wait a moment.'),
});
