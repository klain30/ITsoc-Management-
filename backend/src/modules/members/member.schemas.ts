import { MembershipStatus, RoleName, UserStatus } from '@prisma/client';
import { z } from 'zod';

import { paginationSchema, searchSchema } from '../../common/pagination.js';
import { emailSchema } from '../auth/auth.schemas.js';

const name = (label: string) => z.string().trim().min(1, `${label} is required.`).max(80);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const studentIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{3,19}$/, 'Student ID must be 4–20 letters, digits or dashes.');

/** Philippine mobile numbers, normalised to +639XXXXXXXXX. */
export const contactNumberSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine((value) => /^(\+639|09)\d{9}$/.test(value), 'Use a PH mobile number like 09171234567.')
  .transform((value) => (value.startsWith('09') ? `+63${value.slice(1)}` : value));

const memberFields = {
  studentId: studentIdSchema,
  firstName: name('First name'),
  middleName: optionalText(80),
  lastName: name('Last name'),
  email: emailSchema,
  course: z.string().trim().min(2, 'Course is required.').max(100),
  yearLevel: z.coerce.number().int().min(1).max(6),
  section: optionalText(20),
  contactNumber: contactNumberSchema.nullish().or(z.literal('').transform(() => null)),
  status: z.nativeEnum(MembershipStatus),
  dateJoined: z.coerce.date(),
};

export const createMemberSchema = z.object({
  ...memberFields,
  status: memberFields.status.default('ACTIVE'),
  dateJoined: memberFields.dateJoined.optional(),
});

export const updateMemberSchema = z.object(memberFields).partial().strict();

/** Fields members may edit on their own profile. */
export const updateOwnProfileSchema = z
  .object({
    contactNumber: memberFields.contactNumber,
    section: memberFields.section,
    middleName: memberFields.middleName,
  })
  .partial()
  .strict();

export const listMembersSchema = paginationSchema.extend({
  search: searchSchema,
  status: z.nativeEnum(MembershipStatus).optional(),
  role: z.nativeEnum(RoleName).optional(),
  officersOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  sort: z.enum(['name', 'studentId', 'dateJoined', 'createdAt']).default('name'),
});

export const changeRoleSchema = z.object({ role: z.nativeEnum(RoleName) });

export const changeAccountStatusSchema = z.object({
  status: z.enum([UserStatus.ACTIVE, UserStatus.DISABLED]),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type ListMembersInput = z.infer<typeof listMembersSchema>;
