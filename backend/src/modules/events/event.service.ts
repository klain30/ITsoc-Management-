import { EventStatus, Prisma } from '@prisma/client';

import { conflict, notFound, unprocessable } from '../../common/errors.js';
import { paginated, toSkipTake } from '../../common/pagination.js';
import type { ActorContext } from '../../common/request.js';
import { prisma } from '../../lib/prisma.js';
import { diffFields, recordAudit } from '../audit/audit.service.js';
import { notifyMembers } from '../notifications/notification.service.js';
import type { CreateEventInput, ListEventsInput, UpdateEventInput } from './event.schemas.js';

/** Who is asking — decides what they can see and personalises the result. */
export type EventViewer = { memberId: string; canManage: boolean };

/** Allowed status transitions. COMPLETED and CANCELLED are terminal. */
const TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['DRAFT', 'ONGOING', 'CANCELLED'],
  ONGOING: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

const MEMBER_VISIBLE: EventStatus[] = ['PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED'];

const eventSelect = (memberId: string) =>
  ({
    id: true,
    name: true,
    description: true,
    location: true,
    startsAt: true,
    endsAt: true,
    capacity: true,
    registrationDeadline: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    createdBy: { select: { member: { select: { firstName: true, lastName: true } } } },
    _count: { select: { registrations: { where: { status: 'REGISTERED' } } } },
    registrations: { where: { memberId }, select: { status: true, registeredAt: true } },
    attendance: { where: { memberId }, select: { status: true, checkedInAt: true } },
    certificates: { where: { memberId, revokedAt: null }, select: { id: true, code: true } },
  }) satisfies Prisma.EventSelect;

type EventRow = Prisma.EventGetPayload<{ select: ReturnType<typeof eventSelect> }>;

const toEventDto = ({ _count, registrations, attendance, certificates, createdBy, ...event }: EventRow) => {
  const registeredCount = _count.registrations;
  const myRegistration = registrations[0] ?? null;
  return {
    ...event,
    createdBy: `${createdBy.member.firstName} ${createdBy.member.lastName}`,
    registeredCount,
    spotsLeft: Math.max(0, event.capacity - registeredCount),
    isRegistrationOpen: event.status === 'PUBLISHED' && event.registrationDeadline > new Date() && registeredCount < event.capacity,
    myRegistration: myRegistration?.status === 'REGISTERED' ? myRegistration : null,
    myAttendance: attendance[0] ?? null,
    myCertificate: certificates[0] ?? null,
  };
};

export type EventDto = ReturnType<typeof toEventDto>;

export const listEvents = async (input: ListEventsInput, viewer: EventViewer) => {
  const now = new Date();
  const where: Prisma.EventWhereInput = {
    AND: [
      viewer.canManage ? {} : { status: { in: MEMBER_VISIBLE } },
      input.status ? { status: input.status } : {},
      input.timeframe === 'upcoming' ? { endsAt: { gte: now } } : {},
      input.timeframe === 'past' ? { endsAt: { lt: now } } : {},
      input.mine ? { registrations: { some: { memberId: viewer.memberId, status: 'REGISTERED' } } } : {},
      input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: 'insensitive' } },
              { location: { contains: input.search, mode: 'insensitive' } },
            ],
          }
        : {},
    ],
  };
  const orderBy: Prisma.EventOrderByWithRelationInput = { startsAt: input.timeframe === 'past' ? 'desc' : 'asc' };

  const [rows, total] = await prisma.$transaction([
    prisma.event.findMany({ where, select: eventSelect(viewer.memberId), orderBy, ...toSkipTake(input) }),
    prisma.event.count({ where }),
  ]);
  return paginated(rows.map(toEventDto), total, input);
};

export const getEvent = async (id: string, viewer: EventViewer) => {
  const event = await prisma.event.findUnique({ where: { id }, select: eventSelect(viewer.memberId) });
  // Drafts are invisible (not forbidden) to members, so their existence does not leak.
  if (!event || (!viewer.canManage && !MEMBER_VISIBLE.includes(event.status))) throw notFound('Event');
  return toEventDto(event);
};

export const createEvent = async (input: CreateEventInput, actor: ActorContext & { userId: string }) => {
  if (input.startsAt <= new Date()) throw unprocessable('The event must start in the future.');
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: { ...input, createdById: actor.userId },
      select: eventSelect(''),
    });
    await recordAudit(tx, actor, { action: 'event.created', entityType: 'Event', entityId: event.id, metadata: { name: event.name } });
    return toEventDto(event);
  });
};

export const updateEvent = async (id: string, input: UpdateEventInput, actor: ActorContext) => {
  const before = await prisma.event.findUnique({
    where: { id },
    include: { _count: { select: { registrations: { where: { status: 'REGISTERED' } } } } },
  });
  if (!before) throw notFound('Event');
  if (before.status !== 'DRAFT' && before.status !== 'PUBLISHED') {
    throw unprocessable(`A ${before.status.toLowerCase()} event can no longer be edited.`);
  }

  // Re-check cross-field rules against the merged record.
  const merged = { ...before, ...input };
  if (merged.endsAt <= merged.startsAt) throw unprocessable('End time must be after the start time.');
  if (merged.registrationDeadline > merged.startsAt) throw unprocessable('Registration must close before the event starts.');
  if (input.startsAt && input.startsAt <= new Date()) throw unprocessable('The event must start in the future.');
  if (input.capacity !== undefined && input.capacity < before._count.registrations) {
    throw unprocessable(`Capacity cannot be lower than the ${before._count.registrations} members already registered.`);
  }

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.update({ where: { id }, data: input, select: eventSelect('') });
    const changes = diffFields(before, input);
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, actor, { action: 'event.updated', entityType: 'Event', entityId: id, metadata: { changes } });
    }
    return toEventDto(event);
  });
};

/**
 * Moves an event through its lifecycle. Side effects:
 * - CANCELLED: registrants are notified.
 * - COMPLETED: open attendance sessions are closed and registered members
 *   with no attendance record are marked ABSENT.
 */
export const changeEventStatus = async (id: string, next: EventStatus, actor: ActorContext) => {
  const event = await prisma.event.findUnique({
    where: { id },
    include: { _count: { select: { registrations: { where: { status: 'REGISTERED' } } } } },
  });
  if (!event) throw notFound('Event');
  if (event.status === next) return getEvent(id, { memberId: '', canManage: true });
  if (!TRANSITIONS[event.status].includes(next)) {
    throw unprocessable(`Cannot change an event from ${event.status} to ${next}.`, 'INVALID_STATUS_TRANSITION');
  }
  if (next === 'PUBLISHED' && event.startsAt <= new Date()) {
    throw unprocessable('This event has already started; update its schedule before publishing.');
  }
  if (next === 'DRAFT' && event._count.registrations > 0) {
    throw unprocessable('Members have already registered; cancel the event instead of unpublishing it.');
  }

  let absentCount = 0;
  await prisma.$transaction(async (tx) => {
    // Conditional update guards against a concurrent transition.
    const updated = await tx.event.updateMany({ where: { id, status: event.status }, data: { status: next } });
    if (updated.count === 0) throw conflict('The event was changed by someone else. Refresh and try again.');

    if (next === 'COMPLETED') {
      const now = new Date();
      await tx.attendanceSession.updateMany({ where: { eventId: id, closedAt: null }, data: { closedAt: now } });
      absentCount = await markNoShowsAbsent(tx, id);
    }

    if (next === 'CANCELLED') {
      const registrants = await tx.eventRegistration.findMany({ where: { eventId: id, status: 'REGISTERED' }, select: { memberId: true } });
      await notifyMembers(
        tx,
        registrants.map((r) => r.memberId),
        {
          type: 'EVENT_CANCELLED',
          title: 'Event cancelled',
          body: `"${event.name}" has been cancelled.`,
          link: `/events/${id}`,
        },
      );
    }

    await recordAudit(tx, actor, {
      action: 'event.status_changed',
      entityType: 'Event',
      entityId: id,
      metadata: { from: event.status, to: next, ...(next === 'COMPLETED' ? { markedAbsent: absentCount } : {}) },
    });
  });

  return getEvent(id, { memberId: '', canManage: true });
};

/** Registered members without an attendance record become ABSENT (source SYSTEM). */
export const markNoShowsAbsent = async (tx: Prisma.TransactionClient, eventId: string) => {
  const noShows = await tx.eventRegistration.findMany({
    where: { eventId, status: 'REGISTERED', member: { attendance: { none: { eventId } } } },
    select: { memberId: true },
  });
  if (noShows.length === 0) return 0;
  const result = await tx.attendance.createMany({
    data: noShows.map(({ memberId }) => ({ eventId, memberId, status: 'ABSENT' as const, source: 'SYSTEM' as const })),
    skipDuplicates: true,
  });
  return result.count;
};

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * Registers the caller. The event row is locked (SELECT … FOR UPDATE) so
 * concurrent registrations cannot push the event over capacity.
 */
export const registerForEvent = async (eventId: string, memberId: string) => {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { status: true } });
  if (member?.status !== 'ACTIVE') throw unprocessable('Only active members can register for events.');

  const registration = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    if (locked.length === 0) throw notFound('Event');

    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
    if (event.status !== 'PUBLISHED') {
      if (event.status === 'DRAFT') throw notFound('Event');
      throw unprocessable('Registration is closed for this event.', 'REGISTRATION_CLOSED');
    }
    if (event.registrationDeadline <= new Date()) {
      throw unprocessable('The registration deadline has passed.', 'REGISTRATION_CLOSED');
    }

    const existing = await tx.eventRegistration.findUnique({ where: { eventId_memberId: { eventId, memberId } } });
    if (existing?.status === 'REGISTERED') throw conflict('You are already registered for this event.');

    const registered = await tx.eventRegistration.count({ where: { eventId, status: 'REGISTERED' } });
    if (registered >= event.capacity) throw unprocessable('This event is full.', 'EVENT_FULL');

    const saved = existing
      ? await tx.eventRegistration.update({
          where: { id: existing.id },
          data: { status: 'REGISTERED', registeredAt: new Date(), cancelledAt: null },
        })
      : await tx.eventRegistration.create({ data: { eventId, memberId } });

    await notifyMembers(tx, [memberId], {
      type: 'EVENT_REGISTRATION_CONFIRMED',
      title: 'Registration confirmed',
      body: `You're registered for "${event.name}".`,
      link: `/events/${eventId}`,
    });
    return saved;
  });
  return registration;
};

export const cancelRegistration = async (eventId: string, memberId: string) => {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.status === 'DRAFT') throw notFound('Event');
  if (event.status !== 'PUBLISHED' || event.registrationDeadline <= new Date()) {
    throw unprocessable('Registrations can only be cancelled before the registration deadline.', 'REGISTRATION_CLOSED');
  }
  const result = await prisma.eventRegistration.updateMany({
    where: { eventId, memberId, status: 'REGISTERED' },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  if (result.count === 0) throw notFound('Registration');
};

export const listRegistrations = async (eventId: string) => {
  const exists = await prisma.event.count({ where: { id: eventId } });
  if (!exists) throw notFound('Event');
  const rows = await prisma.eventRegistration.findMany({
    where: { eventId },
    orderBy: [{ status: 'asc' }, { registeredAt: 'asc' }],
    select: {
      id: true,
      status: true,
      registeredAt: true,
      cancelledAt: true,
      member: {
        select: {
          id: true,
          studentId: true,
          firstName: true,
          lastName: true,
          course: true,
          yearLevel: true,
          attendance: { where: { eventId }, select: { id: true, status: true, checkedInAt: true, source: true } },
        },
      },
    },
  });
  return rows.map(({ member: { attendance, ...member }, ...registration }) => ({
    ...registration,
    member: { ...member, fullName: `${member.firstName} ${member.lastName}` },
    attendance: attendance[0] ?? null,
  }));
};
