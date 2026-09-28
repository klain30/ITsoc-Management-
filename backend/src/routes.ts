import { Router } from 'express';

import { authenticate } from './middleware/authenticate.js';
import { announcementRouter } from './modules/announcements/announcement.routes.js';
import { attendanceRouter, eventAttendanceRouter, sessionRouter } from './modules/attendance/attendance.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import authRouter from './modules/auth/auth.routes.js';
import { certificateRouter, eventCertificateRouter, publicCertificateRouter } from './modules/certificates/certificate.routes.js';
import { dashboardRouter, reportRouter } from './modules/dashboard/dashboard.routes.js';
import { documentRouter } from './modules/documents/document.routes.js';
import { eventRouter } from './modules/events/event.routes.js';
import { budgetRouter, expenseRouter, financeRouter, receiptRouter } from './modules/finance/finance.routes.js';
import { memberRouter, profileRouter } from './modules/members/member.routes.js';
import { notificationRouter } from './modules/notifications/notification.routes.js';
import { organizationRouter } from './modules/organization/organization.routes.js';
import { assignmentRouter, positionRouter } from './modules/positions/position.routes.js';
import { roleRouter } from './modules/roles/role.routes.js';

export const apiRouter = Router();

// ─── Public ────────────────────────────────────────────────────────────────
apiRouter.use('/auth', authRouter);
apiRouter.use('/organization', organizationRouter);
apiRouter.use('/public/certificates', publicCertificateRouter);

// ─── Authenticated ─────────────────────────────────────────────────────────
// Everything registered below this line requires a valid access token.
// Individual routes add permission checks with authorize().
apiRouter.use(authenticate);

apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/reports', reportRouter);
apiRouter.use('/profile', profileRouter);
apiRouter.use('/members', memberRouter);
apiRouter.use('/roles', roleRouter);
apiRouter.use('/positions', positionRouter);
apiRouter.use('/position-assignments', assignmentRouter);

apiRouter.use('/events', eventRouter);
apiRouter.use('/events/:eventId', eventAttendanceRouter);
apiRouter.use('/events/:eventId/certificates', eventCertificateRouter);
apiRouter.use('/attendance-sessions', sessionRouter);
apiRouter.use('/attendance', attendanceRouter);
apiRouter.use('/certificates', certificateRouter);

apiRouter.use('/finance', financeRouter);
apiRouter.use('/budgets', budgetRouter);
apiRouter.use('/expenses', expenseRouter);
apiRouter.use('/receipts', receiptRouter);

apiRouter.use('/documents', documentRouter);
apiRouter.use('/announcements', announcementRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/audit-logs', auditRouter);
