import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type Paginated<T> = { data: T[]; meta: PaginationMeta };

export const toSkipTake = ({ page, pageSize }: PaginationInput) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});

export const paginated = <T>(data: T[], total: number, { page, pageSize }: PaginationInput): Paginated<T> => ({
  data,
  meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
});

/** Trimmed optional search string; empty strings become undefined. */
export const searchSchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => (value ? value : undefined));
