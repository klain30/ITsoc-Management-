/**
 * Response shapes returned by the ITSoc API. Kept in one place so every
 * feature agrees on them; update alongside the backend DTOs.
 */

export type Role = 'PRESIDENT' | 'VICE_PRESIDENT' | 'SECRETARY' | 'TREASURER' | 'AUDITOR' | 'MEMBER';

export type Permission =
  | 'members:read'
  | 'members:manage'
  | 'positions:manage'
  | 'roles:assign'
  | 'events:manage'
  | 'attendance:read'
  | 'attendance:manage'
  | 'certificates:issue'
  | 'finance:read'
  | 'finance:manage'
  | 'expenses:approve'
  | 'documents:read'
  | 'documents:manage'
  | 'announcements:manage'
  | 'reports:read'
  | 'audit:read';

export type MembershipStatus = 'ACTIVE' | 'INACTIVE' | 'ALUMNI';
export type UserStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
export type RegistrationStatus = 'REGISTERED' | 'CANCELLED';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT';
export type AttendanceSource = 'QR' | 'MANUAL' | 'SYSTEM';
export type BudgetStatus = 'ACTIVE' | 'CLOSED';
export type ExpenseStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';
export type ExpenseCategory =
  | 'FOOD'
  | 'DECORATIONS'
  | 'MATERIALS'
  | 'PRINTING'
  | 'PRIZES'
  | 'TRANSPORTATION'
  | 'VENUE'
  | 'HONORARIUM'
  | 'OTHER';
export type DocumentCategory =
  | 'EVENT_PROPOSAL'
  | 'MEETING_MINUTES'
  | 'FINANCIAL_REPORT'
  | 'ACCOMPLISHMENT_REPORT'
  | 'ORGANIZATION_DOCUMENT'
  | 'OTHER';
export type DocumentVisibility = 'OFFICERS' | 'MEMBERS';
export type AnnouncementStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type NotificationType =
  | 'EVENT_REGISTRATION_CONFIRMED'
  | 'EVENT_REMINDER'
  | 'EVENT_CANCELLED'
  | 'CERTIFICATE_AVAILABLE'
  | 'ANNOUNCEMENT_PUBLISHED'
  | 'EXPENSE_APPROVED'
  | 'EXPENSE_REJECTED'
  | 'EXPENSE_REIMBURSED';

/** ISO 8601 timestamp string. */
export type ISODate = string;
/** Decimal amount as a string with 2 decimals, e.g. "12500.00". */
export type Money = string;

export type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
export type Paginated<T, M = object> = { data: T[]; meta: PageMeta & M };
export type Envelope<T> = { data: T };

// ─── Auth ───────────────────────────────────────────────────────────────────

export type SessionUser = {
  id: string;
  memberId: string;
  email: string;
  firstName: string;
  lastName: string;
  studentId: string;
  hasProfileImage: boolean;
  role: Role;
  position: string | null;
  permissions: Permission[];
};

export type AuthPayload = { user: SessionUser; accessToken: string };

export type AccountTokenPreview = {
  type: 'INVITATION' | 'PASSWORD_RESET';
  email: string;
  firstName: string;
  expiresAt: ISODate;
};

export type Organization = { name: string; shortName: string; university: string; email: string | null };

// ─── Members ────────────────────────────────────────────────────────────────

export type Member = {
  id: string;
  studentId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullName: string;
  email: string;
  course: string;
  yearLevel: number;
  section: string | null;
  contactNumber: string | null;
  status: MembershipStatus;
  dateJoined: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
  hasProfileImage: boolean;
  position: { id: string; name: string; assignmentId: string; since: ISODate } | null;
  account: { userId: string; status: UserStatus; role: Role; lastLoginAt: ISODate | null } | null;
};

export type MemberSummary = {
  registrations: number;
  attendance: Partial<Record<AttendanceStatus, number>>;
  certificates: number;
  positionHistory: {
    id: string;
    startDate: ISODate;
    endDate: ISODate | null;
    position: { id: string; name: string };
  }[];
};

export type MemberDetail = Member & { summary: MemberSummary };

export type AccessLink = { type?: 'INVITATION' | 'PASSWORD_RESET'; link: string; expiresAt: ISODate };

export type Position = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  holders: { assignmentId: string; since: ISODate; memberId: string; name: string; studentId: string }[];
};

export type RoleMatrix = {
  roles: { name: Role; description: string; activeUsers: number; permissions: Permission[] }[];
  permissions: { key: Permission; description: string }[];
};

// ─── Events & attendance ────────────────────────────────────────────────────

export type EventItem = {
  id: string;
  name: string;
  description: string | null;
  location: string;
  startsAt: ISODate;
  endsAt: ISODate;
  capacity: number;
  registrationDeadline: ISODate;
  status: EventStatus;
  createdAt: ISODate;
  updatedAt: ISODate;
  createdBy: string;
  registeredCount: number;
  spotsLeft: number;
  isRegistrationOpen: boolean;
  myRegistration: { status: RegistrationStatus; registeredAt: ISODate } | null;
  myAttendance: { status: AttendanceStatus; checkedInAt: ISODate | null } | null;
  myCertificate: { id: string; code: string } | null;
};

export type Registration = {
  id: string;
  status: RegistrationStatus;
  registeredAt: ISODate;
  cancelledAt: ISODate | null;
  member: { id: string; studentId: string; firstName: string; lastName: string; fullName: string; course: string; yearLevel: number };
  attendance: { id: string; status: AttendanceStatus; checkedInAt: ISODate | null; source: AttendanceSource } | null;
};

export type AttendanceSession = {
  id: string;
  eventId: string;
  name: string;
  opensAt: ISODate;
  closesAt: ISODate;
  lateAfter: ISODate;
  closedAt: ISODate | null;
  createdAt: ISODate;
  checkIns: number;
  isOpen: boolean;
};

export type SessionQr = {
  session: AttendanceSession;
  eventName: string;
  url: string;
  code: string;
  qrDataUrl: string;
  rotatesAt: ISODate;
  rotationSeconds: number;
};

export type AttendanceRecord = {
  id: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  checkedInAt: ISODate | null;
  note: string | null;
  updatedAt: ISODate;
  member: { id: string; studentId: string; firstName: string; lastName: string; fullName: string; course: string; yearLevel: number };
  recordedBy: string | null;
};

export type EventAttendance = {
  event: { id: string; name: string; status: EventStatus; startsAt: ISODate };
  stats: { registered: number; present: number; late: number; absent: number; notCheckedIn: number; attendanceRate: number };
  records: AttendanceRecord[];
};

export type CheckInResult = {
  id: string;
  status: AttendanceStatus;
  checkedInAt: ISODate;
  event: { id: string; name: string };
};

export type MyAttendance = {
  id: string;
  status: AttendanceStatus;
  checkedInAt: ISODate | null;
  event: { id: string; name: string; startsAt: ISODate; location: string; status: EventStatus };
};

// ─── Certificates ───────────────────────────────────────────────────────────

export type Certificate = {
  id: string;
  code: string;
  recipientName: string;
  eventName: string;
  eventDate: ISODate;
  issuedAt: ISODate;
  revokedAt: ISODate | null;
  revokedReason: string | null;
  eventId: string;
  memberId: string;
  verificationUrl: string;
  isValid: boolean;
};

export type CertificateVerification = {
  certificateId: string;
  recipientName: string;
  event: string;
  eventDate: ISODate;
  organization: string;
  dateIssued: ISODate;
  status: 'VALID' | 'REVOKED';
  revokedAt: ISODate | null;
};

// ─── Finance ────────────────────────────────────────────────────────────────

export type Budget = {
  id: string;
  name: string;
  description: string | null;
  status: BudgetStatus;
  event: { id: string; name: string; startsAt: ISODate } | null;
  createdBy: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  allocatedAmount: Money;
  spentAmount: Money;
  pendingAmount: Money;
  reimbursedAmount: Money;
  remainingAmount: Money;
  availableAmount: Money;
  utilization: number;
  expenseCount: number;
};

export type BudgetDetail = Budget & { byCategory: { category: ExpenseCategory; amount: Money }[] };

export type Expense = {
  id: string;
  amount: Money;
  category: ExpenseCategory;
  description: string;
  expenseDate: string;
  status: ExpenseStatus;
  reviewedAt: ISODate | null;
  reviewNote: string | null;
  reimbursedAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  createdById: string;
  budget: { id: string; name: string };
  event: { id: string; name: string } | null;
  paidBy: { id: string; name: string } | null;
  createdBy: string | null;
  reviewedBy: string | null;
  receiptCount: number;
};

export type ExpenseDetail = Expense & {
  receipts: { id: string; originalName: string; mimeType: string; sizeBytes: number; uploadedAt: ISODate; uploadedBy: string | null }[];
  history: {
    id: string;
    fromStatus: ExpenseStatus | null;
    toStatus: ExpenseStatus;
    note: string | null;
    createdAt: ISODate;
    changedBy: string | null;
  }[];
};

export type FinanceSummary = {
  totalAllocated: Money;
  totalSpent: Money;
  totalPending: Money;
  remaining: Money;
  utilization: number;
  counts: Record<'pending' | 'approved' | 'rejected' | 'reimbursed', number>;
  byCategory: { category: ExpenseCategory; amount: Money }[];
  monthly: { month: string; amount: Money }[];
  budgets: Budget[];
};

// ─── Documents, announcements, notifications, audit ─────────────────────────

export type DocumentItem = {
  id: string;
  title: string;
  description: string | null;
  category: DocumentCategory;
  visibility: DocumentVisibility;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: ISODate;
  updatedAt: ISODate;
  uploadedBy: string;
};

export type Announcement = {
  id: string;
  title: string;
  content: string;
  status: AnnouncementStatus;
  isPinned: boolean;
  publishedAt: ISODate | null;
  expiresAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  author: string;
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: ISODate | null;
  createdAt: ISODate;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: ISODate;
  actor: { id: string; name: string; email: string; role: Role } | null;
};

// ─── Dashboard & reports ────────────────────────────────────────────────────

export type Dashboard = {
  me: {
    upcomingEvents: { id: string; name: string; startsAt: ISODate; endsAt: ISODate; location: string; status: EventStatus }[];
    openEvents: {
      id: string;
      name: string;
      startsAt: ISODate;
      location: string;
      capacity: number;
      registrationDeadline: ISODate;
      spotsLeft: number;
    }[];
    attendance: { present: number; late: number; absent: number; total: number; rate: number };
    recentAttendance: { id: string; status: AttendanceStatus; checkedInAt: ISODate | null; event: { id: string; name: string; startsAt: ISODate } }[];
    certificates: { count: number; recent: { id: string; code: string; eventName: string; issuedAt: ISODate }[] };
    announcements: { id: string; title: string; content: string; isPinned: boolean; publishedAt: ISODate | null }[];
    unreadNotifications: number;
  };
  organization: {
    members: { active: number; inactive: number; alumni: number; pendingInvites: number; joinedLast30Days: number };
    events: Record<'draft' | 'published' | 'ongoing' | 'completed' | 'cancelled', number>;
    upcomingEvents: { id: string; name: string; startsAt: ISODate; location: string; status: EventStatus; capacity: number; registeredCount: number }[];
    recentEvents: { id: string; name: string; startsAt: ISODate; registered: number; present: number; late: number; absent: number; rate: number }[];
    averageAttendanceRate: number;
  } | null;
  finance: FinanceSummary | null;
  recentActivity: AuditLogEntry[] | null;
};

export type AttendanceReport = {
  events: { id: string; name: string; startsAt: ISODate; location: string; registered: number; present: number; late: number; absent: number; rate: number }[];
  totals: { registered: number; present: number; late: number; absent: number; events: number; rate: number };
};

export type MembershipReport = {
  byStatus: { status: MembershipStatus; count: number }[];
  byCourse: { course: string; count: number }[];
  byYearLevel: { yearLevel: number; count: number }[];
  joinedByMonth: { month: string; count: number }[];
};
