import { BudgetStatus, ExpenseCategory, ExpenseStatus } from '@prisma/client';
import { z } from 'zod';

import { paginationSchema, searchSchema } from '../../common/pagination.js';
import { moneySchema } from '../../lib/money.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((date) => !Number.isNaN(date.getTime()), 'Invalid date.');

export const createBudgetSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: optionalText(500),
  eventId: z.string().max(40).nullish().transform((value) => value || null),
  allocatedAmount: moneySchema,
});

export const updateBudgetSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: optionalText(500),
    allocatedAmount: moneySchema,
    status: z.nativeEnum(BudgetStatus),
  })
  .partial()
  .strict();

export const createExpenseSchema = z.object({
  budgetId: z.string().min(1).max(40),
  amount: moneySchema,
  category: z.nativeEnum(ExpenseCategory),
  description: z.string().trim().min(3).max(300),
  expenseDate: dateOnly,
  paidByMemberId: z.string().max(40).nullish().transform((value) => value || null),
});

export const updateExpenseSchema = createExpenseSchema.omit({ budgetId: true }).partial().strict();

export const reviewSchema = z.object({ note: optionalText(300) });
export const rejectSchema = z.object({ note: z.string().trim().min(5, 'Give a reason for rejecting.').max(300) });

export const listExpensesSchema = paginationSchema.extend({
  budgetId: z.string().max(40).optional(),
  status: z.nativeEnum(ExpenseStatus).optional(),
  category: z.nativeEnum(ExpenseCategory).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  search: searchSchema,
});

export const listBudgetsSchema = z.object({
  status: z.nativeEnum(BudgetStatus).optional(),
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesInput = z.infer<typeof listExpensesSchema>;
