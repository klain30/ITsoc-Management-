import type {
  AnnouncementStatus,
  AttendanceStatus,
  BudgetStatus,
  DocumentCategory,
  EventStatus,
  ExpenseCategory,
  ExpenseStatus,
  MembershipStatus,
  Role,
  UserStatus,
} from '@/types/api';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

type Labelled = { label: string; tone: Tone };

export const ROLE_LABELS: Record<Role, string> = {
  PRESIDENT: 'President',
  VICE_PRESIDENT: 'Vice President',
  SECRETARY: 'Secretary',
  TREASURER: 'Treasurer',
  AUDITOR: 'Auditor',
  MEMBER: 'Member',
};

export const ROLES = Object.keys(ROLE_LABELS) as Role[];

export const MEMBERSHIP_STATUS: Record<MembershipStatus, Labelled> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
  ALUMNI: { label: 'Alumni', tone: 'info' },
};

export const USER_STATUS: Record<UserStatus, Labelled> = {
  INVITED: { label: 'Invite pending', tone: 'warning' },
  ACTIVE: { label: 'Active', tone: 'success' },
  DISABLED: { label: 'Disabled', tone: 'danger' },
};

export const EVENT_STATUS: Record<EventStatus, Labelled> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PUBLISHED: { label: 'Published', tone: 'primary' },
  ONGOING: { label: 'Ongoing', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export const ATTENDANCE_STATUS: Record<AttendanceStatus, Labelled> = {
  PRESENT: { label: 'Present', tone: 'success' },
  LATE: { label: 'Late', tone: 'warning' },
  ABSENT: { label: 'Absent', tone: 'danger' },
};

export const EXPENSE_STATUS: Record<ExpenseStatus, Labelled> = {
  PENDING: { label: 'Pending', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'primary' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  REIMBURSED: { label: 'Reimbursed', tone: 'success' },
};

export const BUDGET_STATUS: Record<BudgetStatus, Labelled> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
};

export const ANNOUNCEMENT_STATUS: Record<AnnouncementStatus, Labelled> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PUBLISHED: { label: 'Published', tone: 'success' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  FOOD: 'Food',
  DECORATIONS: 'Decorations',
  MATERIALS: 'Materials',
  PRINTING: 'Printing',
  PRIZES: 'Prizes',
  TRANSPORTATION: 'Transportation',
  VENUE: 'Venue',
  HONORARIUM: 'Honorarium',
  OTHER: 'Other',
};

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  EVENT_PROPOSAL: 'Event proposal',
  MEETING_MINUTES: 'Meeting minutes',
  FINANCIAL_REPORT: 'Financial report',
  ACCOMPLISHMENT_REPORT: 'Accomplishment report',
  ORGANIZATION_DOCUMENT: 'Organization document',
  OTHER: 'Other',
};

export const YEAR_LEVELS = [1, 2, 3, 4, 5, 6];
export const yearLabel = (year: number) => `${year}${['st', 'nd', 'rd'][year - 1] ?? 'th'} year`;

/** "member.created" → "Member created" */
export const humanizeAction = (action: string) => {
  const text = action.replace(/[._]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const enumOptions = <K extends string>(labels: Record<K, string | Labelled>) =>
  (Object.keys(labels) as K[]).map((value) => {
    const entry = labels[value];
    return { value, label: typeof entry === 'string' ? entry : entry.label };
  });
