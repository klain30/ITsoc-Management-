import { AttendanceStatus, Prisma } from '@prisma/client';
import { z } from 'zod';

import { conflict, notFound, unprocessable } from '../../common/errors.js';
import type { ActorContext } from '../../common/request.js';
import { prisma } from '../../lib/prisma.js';
import { recordAudit } from '../audit/audit.service.js';
import { buildCheckInCode, newSessionSecret, parseCheckInCode, renderQrDataUrl, ROTATION_SECONDS, verifyCheckInCode } from './qr-code.js';

const LATE_GRACE_MS = 15 * 60 * 1000;

export const openSessionSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    closesAt: z.string().datetime({ offset: true }).pipe(z.coerce.date()).optional(),
    lateAfter: z.string().datetime({ offset: true }).pipe(z.coerce.date()).optional(),
  })
  .strict();

export const checkInSchema = z.object({ code: z.string().trim().min(10).max(200) });

export const manualAttendanceSchema = z.object({
  status: z.nativeEnum(AttendanceStatus),
  note: z.string().trim().min(3, 'Give a short reason for the manual change.').max(300),
});

const sessionSelect = {
  id: true,
  eventId: true,
  name: true,
  opensAt: true,
  closesAt: true,
  lateAfter: true,
  closedAt: true,
  createdAt: true,
  _count: { select: { attendance: true } },
} satisfies Prisma.AttendanceSessionSelect;

const toSessionDto = ({ _count, ...session }: Prisma.AttendanceSessionGetPayload<{ select: typeof sessionSelect }>) => {
  const now = new Date();
  return {
    ...session,
    checkIns: _count.attendance,
    isOpen: !session.closedAt && session.opensAt <= now && session.closesAt > now,
  };
};

export const listSessions = async (eventId: string) => {
  const sessions = await prisma.attendanceSession.findMany({
    where: { eventId },
    orderBy: { opensAt: 'desc' },
    select: sessionSelect,
  });
  return sessions.map(toSessionDto);
};

/**
 * Opens a check-in window. A PUBLISHED event moves to ONGOING when its
 * first session opens. Only one session may be open at a time.
 */
export const openSession = async (
  eventId: string,
  input: z.infer<typeof openSessionSchema>,
  actor: ActorContext & { userId: string },
) => {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound('Event');
  if (event.status !== 'PUBLISHED' && event.status !== 'ONGOING') {
    throw unprocessable('Attendance can only be taken for published or ongoing events.');
  }

  const now = new Date();
  const closesAt = input.closesAt ?? event.endsAt;
  if (closesAt <= now) throw unprocessable('The session must close in the future.');
  const lateAfter = input.lateAfter ?? new Date(Math.max(event.startsAt.getTime() + LATE_GRACE_MS, now.getTime()));

  return prisma.$transaction(async (tx) => {
    const open = await tx.attendanceSession.count({ where: { eventId, closedAt: null, closesAt: { gt: now } } });
    if (open > 0) throw conflict('A check-in session is already open for this event. Close it first.');

    if (event.status === 'PUBLISHED') {
      await tx.event.update({ where: { id: eventId }, data: { status: 'ONGOING' } });
      await recordAudit(tx, actor, {
        action: 'event.status_changed',
        entityType: 'Event',
        entityId: eventId,
        metadata: { from: 'PUBLISHED', to: 'ONGOING', reason: 'attendance session opened' },
      });
    }

    const session = await tx.attendanceSession.create({
      data: {
        eventId,
        name: input.name ?? 'Check-in',
        secret: newSessionSecret(),
        opensAt: now,
        closesAt,
        lateAfter,
        createdById: actor.userId,
      },
      select: sessionSelect,
    });
    await recordAudit(tx, actor, {
      action: 'attendance.session_opened',
      entityType: 'AttendanceSession',
      entityId: session.id,
      metadata: { eventId, closesAt: closesAt.toISOString(), lateAfter: lateAfter.toISOString() },
    });
    return toSessionDto(session);
  });
};

export const closeSession = async (sessionId: string, actor: ActorContext) => {
  const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId } });
  if (!session) throw notFound('Attendance session');
  if (session.closedAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.attendanceSession.update({ where: { id: sessionId }, data: { closedAt: new Date() } });
    await recordAudit(tx, actor, {
      action: 'attendance.session_closed',
      entityType: 'AttendanceSession',
      entityId: sessionId,
      metadata: { eventId: session.eventId },
    });
  });
};

/** The rotating QR shown on the officer's screen. */
export const getSessionQr = async (sessionId: string) => {
  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    select: { ...sessionSelect, secret: true, event: { select: { name: true } } },
  });
  if (!session) throw notFound('Attendance session');
  const { secret, event, ...rest } = session;
  const dto = toSessionDto(rest);
  if (!dto.isOpen) throw unprocessable('This session is closed.', 'SESSION_CLOSED');

  const { code, url, rotatesAt } = buildCheckInCode(session.id, secret);
  return {
    session: dto,
    eventName: event.name,
    url,
    code,
    qrDataUrl: await renderQrDataUrl(url),
    rotatesAt,
    rotationSeconds: ROTATION_SECONDS,
  };
};

/**
 * Member self check-in from a scanned QR code. Verifies, in order: code
 * signature and freshness, session window, event state, member standing,
 * registration, and duplicates.
 */
export const checkIn = async (code: string, memberId: string) => {
  const parsed = parseCheckInCode(code);
  if (!parsed) throw unprocessable('This QR code is not a valid check-in code.', 'INVALID_CODE');

  const session = await prisma.attendanceSession.findUnique({
    where: { id: parsed.sessionId },
    include: { event: { select: { id: true, name: true, status: true } } },
  });
  if (!session) throw unprocessable('This QR code is not a valid check-in code.', 'INVALID_CODE');

  const verdict = verifyCheckInCode(parsed, session.secret);
  if (verdict === 'invalid') throw unprocessable('This QR code is not a valid check-in code.', 'INVALID_CODE');
  if (verdict === 'expired') throw unprocessable('This QR code has expired. Scan the code on screen again.', 'CODE_EXPIRED');

  const now = new Date();
  if (session.closedAt || now < session.opensAt || now >= session.closesAt) {
    throw unprocessable('Check-in for this event is closed.', 'SESSION_CLOSED');
  }
  if (session.event.status !== 'ONGOING' && session.event.status !== 'PUBLISHED') {
    throw unprocessable('Check-in for this event is closed.', 'SESSION_CLOSED');
  }

  const [member, registration, existing] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId }, select: { status: true } }),
    prisma.eventRegistration.findUnique({ where: { eventId_memberId: { eventId: session.eventId, memberId } } }),
    prisma.attendance.findUnique({ where: { eventId_memberId: { eventId: session.eventId, memberId } } }),
  ]);
  if (member?.status !== 'ACTIVE') throw unprocessable('Only active members can check in.', 'MEMBER_INACTIVE');
  if (registration?.status !== 'REGISTERED') {
    throw unprocessable('You are not registered for this event.', 'NOT_REGISTERED');
  }
  if (existing) {
    throw conflict('You have already checked in to this event.', { status: existing.status, checkedInAt: existing.checkedInAt });
  }

  const status: AttendanceStatus = now > session.lateAfter ? 'LATE' : 'PRESENT';
  try {
    const attendance = await prisma.attendance.create({
      data: { eventId: session.eventId, memberId, sessionId: session.id, status, source: 'QR', checkedInAt: now },
      select: { id: true, status: true, checkedInAt: true },
    });
    return { ...attendance, event: { id: session.event.id, name: session.event.name } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict('You have already checked in to this event.');
    }
    throw error;
  }
};

export const getEventAttendance = async (eventId: string) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, status: true, startsAt: true },
  });
  if (!event) throw notFound('Event');

  const [records, registered] = await prisma.$transaction([
    prisma.attendance.findMany({
      where: { eventId },
      orderBy: [{ checkedInAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        status: true,
        source: true,
        checkedInAt: true,
        note: true,
        updatedAt: true,
        member: { select: { id: true, studentId: true, firstName: true, lastName: true, course: true, yearLevel: true } },
        recordedBy: { select: { member: { select: { firstName: true, lastName: true } } } },
      },
    }),
    prisma.eventRegistration.count({ where: { eventId, status: 'REGISTERED' } }),
  ]);

  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0 };
  for (const record of records) counts[record.status] += 1;
  const attended = counts.PRESENT + counts.LATE;

  return {
    event,
    stats: {
      registered,
      present: counts.PRESENT,
      late: counts.LATE,
      absent: counts.ABSENT,
      notCheckedIn: Math.max(0, registered - records.length),
      attendanceRate: registered > 0 ? Math.round((attended / registered) * 1000) / 10 : 0,
    },
    records: records.map(({ recordedBy, member, ...record }) => ({
      ...record,
      member: { ...member, fullName: `${member.firstName} ${member.lastName}` },
      recordedBy: recordedBy ? `${recordedBy.member.firstName} ${recordedBy.member.lastName}` : null,
    })),
  };
};

/**
 * Officer correction of a single attendance record (requires
 * attendance:manage). Always audited with the previous value and a reason.
 */
export const setAttendanceManually = async (
  eventId: string,
  memberId: string,
  input: z.infer<typeof manualAttendanceSchema>,
  actor: ActorContext & { userId: string },
) => {
  const [event, member] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId }, select: { status: true } }),
    prisma.member.findUnique({ where: { id: memberId }, select: { id: true } }),
  ]);
  if (!event) throw notFound('Event');
  if (!member) throw notFound('Member');
  if (event.status !== 'ONGOING' && event.status !== 'COMPLETED') {
    throw unprocessable('Attendance can only be recorded for ongoing or completed events.');
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.attendance.findUnique({ where: { eventId_memberId: { eventId, memberId } } });
    const attended = input.status !== 'ABSENT';
    const record = await tx.attendance.upsert({
      where: { eventId_memberId: { eventId, memberId } },
      create: {
        eventId,
        memberId,
        status: input.status,
        source: 'MANUAL',
        checkedInAt: attended ? new Date() : null,
        recordedById: actor.userId,
        note: input.note,
      },
      update: {
        status: input.status,
        source: 'MANUAL',
        recordedById: actor.userId,
        note: input.note,
        checkedInAt: attended ? (before?.checkedInAt ?? new Date()) : null,
      },
    });
    await recordAudit(tx, actor, {
      action: 'attendance.updated',
      entityType: 'Attendance',
      entityId: record.id,
      metadata: { eventId, memberId, from: before?.status ?? null, to: input.status, note: input.note },
    });
    return record;
  });
};

export const getMyAttendance = async (memberId: string) =>
  prisma.attendance.findMany({
    where: { memberId },
    orderBy: { event: { startsAt: 'desc' } },
    select: {
      id: true,
      status: true,
      checkedInAt: true,
      event: { select: { id: true, name: true, startsAt: true, location: true, status: true } },
    },
  });
