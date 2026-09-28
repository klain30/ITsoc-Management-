import { Router, type Request } from 'express';

import { PERMISSIONS } from '../../auth/permissions.js';
import { sendCsv, toCsv } from '../../common/csv.js';
import { actorContext, getAuth, param } from '../../common/request.js';
import { authorize } from '../../middleware/authorize.js';
import * as attendanceService from './attendance.service.js';

const officerActor = (req: Request) => ({ ...actorContext(req), userId: getAuth(req).userId });

/** Mounted at /events/:eventId — attendance for one event. */
export const eventAttendanceRouter = Router({ mergeParams: true });

eventAttendanceRouter.get('/attendance-sessions', authorize(PERMISSIONS.ATTENDANCE_READ), async (req, res) => {
  res.json({ data: await attendanceService.listSessions(param(req, 'eventId')) });
});

eventAttendanceRouter.post('/attendance-sessions', authorize(PERMISSIONS.ATTENDANCE_MANAGE), async (req, res) => {
  const input = attendanceService.openSessionSchema.parse(req.body ?? {});
  res.status(201).json({ data: await attendanceService.openSession(param(req, 'eventId'), input, officerActor(req)) });
});

eventAttendanceRouter.get('/attendance', authorize(PERMISSIONS.ATTENDANCE_READ), async (req, res) => {
  res.json({ data: await attendanceService.getEventAttendance(param(req, 'eventId')) });
});

eventAttendanceRouter.get('/attendance.csv', authorize(PERMISSIONS.ATTENDANCE_READ), async (req, res) => {
  const { event, records } = await attendanceService.getEventAttendance(param(req, 'eventId'));
  const csv = toCsv(records, [
    { header: 'Student ID', value: (r) => r.member.studentId },
    { header: 'Name', value: (r) => r.member.fullName },
    { header: 'Course', value: (r) => r.member.course },
    { header: 'Year', value: (r) => r.member.yearLevel },
    { header: 'Status', value: (r) => r.status },
    { header: 'Checked in at', value: (r) => r.checkedInAt?.toISOString() },
    { header: 'Source', value: (r) => r.source },
    { header: 'Note', value: (r) => r.note },
  ]);
  sendCsv(res, `attendance-${event.name}.csv`, csv);
});

eventAttendanceRouter.put('/attendance/:memberId', authorize(PERMISSIONS.ATTENDANCE_MANAGE), async (req, res) => {
  const input = attendanceService.manualAttendanceSchema.parse(req.body);
  const record = await attendanceService.setAttendanceManually(param(req, 'eventId'), param(req, 'memberId'), input, officerActor(req));
  res.json({ data: record });
});

/** Mounted at /attendance-sessions. */
export const sessionRouter = Router();

sessionRouter.get('/:id/qr', authorize(PERMISSIONS.ATTENDANCE_MANAGE), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: await attendanceService.getSessionQr(param(req, 'id')) });
});

sessionRouter.patch('/:id/close', authorize(PERMISSIONS.ATTENDANCE_MANAGE), async (req, res) => {
  await attendanceService.closeSession(param(req, 'id'), actorContext(req));
  res.status(204).end();
});

/** Mounted at /attendance — member self-service. */
export const attendanceRouter = Router();

// The event is derived from the signed code, and the member from the token.
attendanceRouter.post('/check-in', async (req, res) => {
  const { code } = attendanceService.checkInSchema.parse(req.body);
  res.status(201).json({ data: await attendanceService.checkIn(code, getAuth(req).memberId) });
});

attendanceRouter.get('/me', async (req, res) => {
  res.json({ data: await attendanceService.getMyAttendance(getAuth(req).memberId) });
});
