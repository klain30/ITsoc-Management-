import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';

export const attendanceReportSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Attendance per completed event in a date range. */
export const getAttendanceReport = async ({ from, to }: z.infer<typeof attendanceReportSchema>) => {
  const events = await prisma.event.findMany({
    where: { status: 'COMPLETED', startsAt: { gte: from, lte: to } },
    orderBy: { startsAt: 'desc' },
    select: {
      id: true,
      name: true,
      startsAt: true,
      location: true,
      _count: { select: { registrations: { where: { status: 'REGISTERED' } } } },
    },
  });
  const grouped = await prisma.attendance.groupBy({
    by: ['eventId', 'status'],
    where: { eventId: { in: events.map((e) => e.id) } },
    _count: { _all: true },
    orderBy: { eventId: 'asc' },
  });

  const rows = events.map(({ _count, ...event }) => {
    const get = (status: string) =>
      (grouped.find((g) => g.eventId === event.id && g.status === status)?._count as { _all: number } | undefined)?._all ?? 0;
    const present = get('PRESENT');
    const late = get('LATE');
    const registered = _count.registrations;
    return {
      ...event,
      registered,
      present,
      late,
      absent: get('ABSENT'),
      rate: registered > 0 ? Math.round(((present + late) / registered) * 1000) / 10 : 0,
    };
  });

  const totals = rows.reduce(
    (acc, row) => ({
      registered: acc.registered + row.registered,
      present: acc.present + row.present,
      late: acc.late + row.late,
      absent: acc.absent + row.absent,
    }),
    { registered: 0, present: 0, late: 0, absent: 0 },
  );
  return {
    events: rows,
    totals: {
      ...totals,
      events: rows.length,
      rate: totals.registered > 0 ? Math.round(((totals.present + totals.late) / totals.registered) * 1000) / 10 : 0,
    },
  };
};

/** Membership composition. */
export const getMembershipReport = async () => {
  const [byStatus, byCourse, byYear, monthly] = await Promise.all([
    prisma.member.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    prisma.member.groupBy({ by: ['course'], where: { status: 'ACTIVE' }, _count: { _all: true }, orderBy: { course: 'asc' } }),
    prisma.member.groupBy({ by: ['yearLevel'], where: { status: 'ACTIVE' }, _count: { _all: true }, orderBy: { yearLevel: 'asc' } }),
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT to_char(date_trunc('month', "dateJoined"), 'YYYY-MM') AS month, COUNT(*) AS count
      FROM "Member"
      WHERE "dateJoined" >= date_trunc('month', now()) - interval '11 months'
      GROUP BY 1 ORDER BY 1`,
  ]);
  const count = (row: { _count: unknown }) => (row._count as { _all: number })._all;
  return {
    byStatus: byStatus.map((row) => ({ status: row.status, count: count(row) })),
    byCourse: byCourse.map((row) => ({ course: row.course, count: count(row) })),
    byYearLevel: byYear.map((row) => ({ yearLevel: row.yearLevel, count: count(row) })),
    joinedByMonth: monthly.map((row) => ({ month: row.month, count: Number(row.count) })),
  };
};
