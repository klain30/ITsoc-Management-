import { EventStatus } from '@prisma/client';
import { z } from 'zod';

import { paginationSchema, searchSchema } from '../../common/pagination.js';

const isoDateTime = z.string().datetime({ offset: true, message: 'Use an ISO 8601 date-time.' }).pipe(z.coerce.date());

const eventFields = z.object({
  name: z.string().trim().min(3).max(150),
  description: z
    .string()
    .trim()
    .max(5000)
    .nullish()
    .transform((value) => value || null),
  location: z.string().trim().min(2).max(200),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  capacity: z.coerce.number().int().min(1).max(10_000),
  registrationDeadline: isoDateTime,
});

type EventTimes = { startsAt?: Date; endsAt?: Date; registrationDeadline?: Date };

/** Cross-field rules shared by create and update. */
export const refineEventTimes = (value: EventTimes, ctx: z.RefinementCtx) => {
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End time must be after the start time.' });
  }
  if (value.startsAt && value.endsAt && value.endsAt.getTime() - value.startsAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Events cannot be longer than 7 days.' });
  }
  if (value.startsAt && value.registrationDeadline && value.registrationDeadline > value.startsAt) {
    ctx.addIssue({ code: 'custom', path: ['registrationDeadline'], message: 'Registration must close before the event starts.' });
  }
};

export const createEventSchema = eventFields.superRefine(refineEventTimes);

export const updateEventSchema = eventFields.partial().strict().superRefine(refineEventTimes);

export const changeEventStatusSchema = z.object({ status: z.nativeEnum(EventStatus) });

export const listEventsSchema = paginationSchema.extend({
  search: searchSchema,
  status: z.nativeEnum(EventStatus).optional(),
  timeframe: z.enum(['upcoming', 'past', 'all']).default('all'),
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type ListEventsInput = z.infer<typeof listEventsSchema>;
