import { Prisma } from '@prisma/client';
import { z } from 'zod';

/**
 * Money is handled as Prisma.Decimal end to end and serialised as a string
 * with two decimals ("12500.00"). Never convert to a JS number for math.
 */
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export const ZERO = new Prisma.Decimal(0);

/** Accepts "12500", "12500.5", 12500.5 — rejects negatives, >2 decimals, and values that do not fit NUMERIC(12,2). */
export const moneySchema = z
  .union([z.string().trim(), z.number()])
  .transform((value) => String(value))
  .refine((value) => /^\d{1,10}(\.\d{1,2})?$/.test(value), 'Enter an amount with at most 2 decimal places.')
  .transform((value) => new Prisma.Decimal(value))
  .refine((value) => value.greaterThan(0), 'Amount must be greater than zero.');

export const money = (value: Prisma.Decimal | null | undefined) => (value ?? ZERO).toFixed(2);

export const sum = (values: (Prisma.Decimal | null | undefined)[]) =>
  values.reduce<Prisma.Decimal>((total, value) => total.plus(value ?? ZERO), ZERO);
