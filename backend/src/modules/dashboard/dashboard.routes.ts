import { Router } from 'express';

import { PERMISSIONS } from '../../auth/permissions.js';
import { sendCsv, toCsv } from '../../common/csv.js';
import { getAuth } from '../../common/request.js';
import { authorize, authorizeAny } from '../../middleware/authorize.js';
import { getDashboard } from './dashboard.service.js';
import { attendanceReportSchema, getAttendanceReport, getMembershipReport } from './report.service.js';

/** Mounted at /dashboard. */
export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  res.json({ data: await getDashboard(getAuth(req)) });
});

/** Mounted at /reports. Financial reports live under /finance and /expenses/export.csv. */
export const reportRouter = Router();

reportRouter.get('/attendance', authorizeAny(PERMISSIONS.REPORTS_READ, PERMISSIONS.ATTENDANCE_READ), async (req, res) => {
  res.json({ data: await getAttendanceReport(attendanceReportSchema.parse(req.query)) });
});

reportRouter.get('/attendance.csv', authorizeAny(PERMISSIONS.REPORTS_READ, PERMISSIONS.ATTENDANCE_READ), async (req, res) => {
  const { events } = await getAttendanceReport(attendanceReportSchema.parse(req.query));
  const csv = toCsv(events, [
    { header: 'Event', value: (r) => r.name },
    { header: 'Date', value: (r) => r.startsAt.toISOString().slice(0, 10) },
    { header: 'Location', value: (r) => r.location },
    { header: 'Registered', value: (r) => r.registered },
    { header: 'Present', value: (r) => r.present },
    { header: 'Late', value: (r) => r.late },
    { header: 'Absent', value: (r) => r.absent },
    { header: 'Attendance rate (%)', value: (r) => r.rate },
  ]);
  sendCsv(res, `attendance-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

reportRouter.get('/membership', authorize(PERMISSIONS.REPORTS_READ), async (_req, res) => {
  res.json({ data: await getMembershipReport() });
});
