import { PERMISSIONS } from '../../auth/permissions.js';
import type { AuthContext } from '../../common/request.js';
import { prisma } from '../../lib/prisma.js';
import { listAuditLogs } from '../audit/audit.service.js';
import { getFinanceSummary } from '../finance/finance.service.js';

const day = 24 * 60 * 60 * 1000;

const rate = (attended: number, total: number) => (total > 0 ? Math.round((attended / total) * 1000) / 10 : 0);

/** Personal section: shown to everyone. */
const getPersonalSection = async (memberId: string, userId: string) => {
  const now = new Date();
  const [upcoming, open, attendance, recentAttendance, certificateCount, recentCertificates, announcements, unread] =
    await Promise.all([
      prisma.event.findMany({
        where: { endsAt: { gte: now }, status: { in: ['PUBLISHED', 'ONGOING'] }, registrations: { some: { memberId, status: 'REGISTERED' } } },
        orderBy: { startsAt: 'asc' },
        take: 5,
        select: { id: true, name: true, startsAt: true, endsAt: true, location: true, status: true },
      }),
      prisma.event.findMany({
        where: {
          status: 'PUBLISHED',
          registrationDeadline: { gt: now },
          registrations: { none: { memberId, status: 'REGISTERED' } },
        },
        orderBy: { startsAt: 'asc' },
        take: 5,
        select: {
          id: true,
          name: true,
          startsAt: true,
          location: true,
          capacity: true,
          registrationDeadline: true,
          _count: { select: { registrations: { where: { status: 'REGISTERED' } } } },
        },
      }),
      prisma.attendance.groupBy({ by: ['status'], where: { memberId }, _count: { _all: true }, orderBy: { status: 'asc' } }),
      prisma.attendance.findMany({
        where: { memberId },
        orderBy: { event: { startsAt: 'desc' } },
        take: 5,
        select: { id: true, status: true, checkedInAt: true, event: { select: { id: true, name: true, startsAt: true } } },
      }),
      prisma.certificate.count({ where: { memberId, revokedAt: null } }),
      prisma.certificate.findMany({
        where: { memberId, revokedAt: null },
        orderBy: { issuedAt: 'desc' },
        take: 3,
        select: { id: true, code: true, eventName: true, issuedAt: true },
      }),
      prisma.announcement.findMany({
        where: { status: 'PUBLISHED', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        take: 3,
        select: { id: true, title: true, content: true, isPinned: true, publishedAt: true },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

  const count = (status: string) =>
    (attendance.find((row) => row.status === status)?._count as { _all: number } | undefined)?._all ?? 0;
  const present = count('PRESENT');
  const late = count('LATE');
  const absent = count('ABSENT');

  return {
    upcomingEvents: upcoming,
    openEvents: open.map(({ _count, ...event }) => ({ ...event, spotsLeft: Math.max(0, event.capacity - _count.registrations) })),
    attendance: { present, late, absent, total: present + late + absent, rate: rate(present + late, present + late + absent) },
    recentAttendance,
    certificates: { count: certificateCount, recent: recentCertificates },
    announcements,
    unreadNotifications: unread,
  };
};

/** Organization-wide section: requires reports:read. */
export const getOrganizationSection = async () => {
  const now = new Date();
  const [membersByStatus, pendingInvites, newMembers, eventsByStatus, upcoming, recentCompleted] = await Promise.all([
    prisma.member.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    prisma.user.count({ where: { status: 'INVITED' } }),
    prisma.member.count({ where: { dateJoined: { gte: new Date(now.getTime() - 30 * day) } } }),
    prisma.event.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    prisma.event.findMany({
      where: { status: { in: ['PUBLISHED', 'ONGOING'] }, endsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 5,
      select: {
        id: true,
        name: true,
        startsAt: true,
        location: true,
        status: true,
        capacity: true,
        _count: { select: { registrations: { where: { status: 'REGISTERED' } } } },
      },
    }),
    prisma.event.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { startsAt: 'desc' },
      take: 6,
      select: { id: true, name: true, startsAt: true },
    }),
  ]);

  const recentIds = recentCompleted.map((e) => e.id);
  const [attendanceByEvent, registrationsByEvent] = await Promise.all([
    prisma.attendance.groupBy({
      by: ['eventId', 'status'],
      where: { eventId: { in: recentIds } },
      _count: { _all: true },
      orderBy: { eventId: 'asc' },
    }),
    prisma.eventRegistration.groupBy({
      by: ['eventId'],
      where: { eventId: { in: recentIds }, status: 'REGISTERED' },
      _count: { _all: true },
      orderBy: { eventId: 'asc' },
    }),
  ]);

  const recentEvents = recentCompleted.map((event) => {
    const rows = attendanceByEvent.filter((row) => row.eventId === event.id);
    const get = (status: string) => (rows.find((r) => r.status === status)?._count as { _all: number } | undefined)?._all ?? 0;
    const registered = (registrationsByEvent.find((r) => r.eventId === event.id)?._count as { _all: number } | undefined)?._all ?? 0;
    const present = get('PRESENT');
    const late = get('LATE');
    return { ...event, registered, present, late, absent: get('ABSENT'), rate: rate(present + late, registered) };
  });

  const statusCount = <T extends string>(rows: { status: T; _count: unknown }[], status: T) =>
    (rows.find((r) => r.status === status)?._count as { _all: number } | undefined)?._all ?? 0;

  const withRegistrations = recentEvents.filter((e) => e.registered > 0);
  return {
    members: {
      active: statusCount(membersByStatus, 'ACTIVE'),
      inactive: statusCount(membersByStatus, 'INACTIVE'),
      alumni: statusCount(membersByStatus, 'ALUMNI'),
      pendingInvites,
      joinedLast30Days: newMembers,
    },
    events: {
      draft: statusCount(eventsByStatus, 'DRAFT'),
      published: statusCount(eventsByStatus, 'PUBLISHED'),
      ongoing: statusCount(eventsByStatus, 'ONGOING'),
      completed: statusCount(eventsByStatus, 'COMPLETED'),
      cancelled: statusCount(eventsByStatus, 'CANCELLED'),
    },
    upcomingEvents: upcoming.map(({ _count, ...event }) => ({ ...event, registeredCount: _count.registrations })),
    recentEvents,
    averageAttendanceRate: withRegistrations.length
      ? Math.round((withRegistrations.reduce((total, e) => total + e.rate, 0) / withRegistrations.length) * 10) / 10
      : 0,
  };
};

/**
 * One endpoint, composed by permission: every user gets the personal
 * section, and officers additionally get the sections their permissions
 * allow. The frontend renders whichever sections are present.
 */
export const getDashboard = async (auth: AuthContext) => {
  const can = (permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) => auth.permissions.has(permission);
  const [me, organization, finance, recentActivity] = await Promise.all([
    getPersonalSection(auth.memberId, auth.userId),
    can(PERMISSIONS.REPORTS_READ) ? getOrganizationSection() : null,
    can(PERMISSIONS.FINANCE_READ) ? getFinanceSummary() : null,
    can(PERMISSIONS.AUDIT_READ) ? listAuditLogs({ page: 1, pageSize: 8 }).then((page) => page.data) : null,
  ]);
  return { me, organization, finance, recentActivity };
};
