import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);

/** bcrypt only uses the first 72 bytes, so cap the length there. */
export const newPasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters.')
  .max(72, 'Password must be at most 72 characters.')
  .regex(/[A-Za-z]/, 'Password must contain a letter.')
  .regex(/\d/, 'Password must contain a number.')
  // bcrypt silently ignores bytes past 72; non-ASCII characters take 2–4 bytes each.
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long.');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.').max(72),
});

export const setPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: newPasswordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(72),
    newPassword: newPasswordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'New password must be different from the current password.',
    path: ['newPassword'],
  });
