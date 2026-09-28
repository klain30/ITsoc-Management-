import { z } from 'zod';

/** Mirrors the server's password policy so users see problems before submitting. */
export const newPasswordSchema = z
  .string()
  .min(10, 'At least 10 characters.')
  .max(72, 'At most 72 characters.')
  .regex(/[A-Za-z]/, 'Include a letter.')
  .regex(/\d/, 'Include a number.');

export const PASSWORD_HINT = 'At least 10 characters, with a letter and a number.';
