import crypto from 'node:crypto';

import QRCode from 'qrcode';

import { env } from '../../config/env.js';
import { safeEqual } from '../../lib/tokens.js';

/** A new code is shown every ROTATION_SECONDS on the officer's screen. */
export const ROTATION_SECONDS = 30;
/**
 * How many rotation slots a scanned code stays valid for (~2.5 minutes),
 * enough for a member to sign in on their phone after scanning, short
 * enough that forwarding a screenshot to an absent friend rarely works.
 */
const ACCEPTED_SLOTS = 5;

const currentSlot = (now = Date.now()) => Math.floor(now / 1000 / ROTATION_SECONDS);

const sign = (secret: string, sessionId: string, slot: number) =>
  crypto.createHmac('sha256', secret).update(`${sessionId}.${slot}`).digest('base64url').slice(0, 22);

export const newSessionSecret = () => crypto.randomBytes(32).toString('hex');

export const buildCheckInCode = (sessionId: string, secret: string, now = Date.now()) => {
  const slot = currentSlot(now);
  const code = `${sessionId}.${slot}.${sign(secret, sessionId, slot)}`;
  const rotatesAt = new Date((slot + 1) * ROTATION_SECONDS * 1000);
  return { code, url: `${env.appUrl}/check-in?code=${encodeURIComponent(code)}`, rotatesAt };
};

export const renderQrDataUrl = (text: string) =>
  QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: 360 });

/** Splits a code without trusting it; returns null if malformed. */
export const parseCheckInCode = (code: string) => {
  const match = /^([a-z0-9]{20,40})\.(\d{1,12})\.([A-Za-z0-9_-]{22})$/.exec(code);
  if (!match) return null;
  return { sessionId: match[1], slot: Number(match[2]), signature: match[3] };
};

export type CodeCheck = 'valid' | 'expired' | 'invalid';

export const verifyCheckInCode = (parsed: NonNullable<ReturnType<typeof parseCheckInCode>>, secret: string, now = Date.now()): CodeCheck => {
  if (!safeEqual(sign(secret, parsed.sessionId, parsed.slot), parsed.signature)) return 'invalid';
  const age = currentSlot(now) - parsed.slot;
  if (age < 0) return 'invalid';
  return age < ACCEPTED_SLOTS ? 'valid' : 'expired';
};
