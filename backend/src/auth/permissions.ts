import type { RoleName } from '@prisma/client';

/**
 * Permission catalogue. This file is the source of truth: `prisma/seed.ts`
 * syncs it into the Permission / RolePermission tables, and the
 * `authorize()` middleware checks keys against what is stored there.
 *
 * Self-service actions every signed-in user can take (view own profile,
 * register for events, check in, view own attendance/certificates, read
 * announcements and notifications) need no permission key.
 */
export const PERMISSIONS = {
  MEMBERS_READ: 'members:read',
  MEMBERS_MANAGE: 'members:manage',
  POSITIONS_MANAGE: 'positions:manage',
  ROLES_ASSIGN: 'roles:assign',
  EVENTS_MANAGE: 'events:manage',
  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_MANAGE: 'attendance:manage',
  CERTIFICATES_ISSUE: 'certificates:issue',
  FINANCE_READ: 'finance:read',
  FINANCE_MANAGE: 'finance:manage',
  EXPENSES_APPROVE: 'expenses:approve',
  DOCUMENTS_READ: 'documents:read',
  DOCUMENTS_MANAGE: 'documents:manage',
  ANNOUNCEMENTS_MANAGE: 'announcements:manage',
  REPORTS_READ: 'reports:read',
  AUDIT_READ: 'audit:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'members:read': 'View the member directory and member profiles',
  'members:manage': 'Create, update, invite and remove members',
  'positions:manage': 'Manage officer positions and assignments',
  'roles:assign': 'Change account roles and enable or disable accounts',
  'events:manage': 'Create, edit, publish and cancel events; view registrations',
  'attendance:read': 'View attendance records and statistics',
  'attendance:manage': 'Run QR attendance sessions and correct attendance records',
  'certificates:issue': 'Issue and revoke event certificates',
  'finance:read': 'View budgets, expenses, receipts and financial reports',
  'finance:manage': 'Create budgets and expenses, upload receipts, record reimbursements',
  'expenses:approve': 'Approve or reject pending expenses',
  'documents:read': 'View officer-only organization documents',
  'documents:manage': 'Upload and remove organization documents',
  'announcements:manage': 'Create, publish and archive announcements',
  'reports:read': 'View organization-wide dashboards and reports',
  'audit:read': 'View the audit log',
};

const P = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  PRESIDENT: [
    P.MEMBERS_READ,
    P.MEMBERS_MANAGE,
    P.POSITIONS_MANAGE,
    P.ROLES_ASSIGN,
    P.EVENTS_MANAGE,
    P.ATTENDANCE_READ,
    P.CERTIFICATES_ISSUE,
    P.FINANCE_READ,
    P.EXPENSES_APPROVE,
    P.DOCUMENTS_READ,
    P.DOCUMENTS_MANAGE,
    P.ANNOUNCEMENTS_MANAGE,
    P.REPORTS_READ,
    P.AUDIT_READ,
  ],
  VICE_PRESIDENT: [
    P.MEMBERS_READ,
    P.MEMBERS_MANAGE,
    P.EVENTS_MANAGE,
    P.ATTENDANCE_READ,
    P.DOCUMENTS_READ,
    P.ANNOUNCEMENTS_MANAGE,
    P.REPORTS_READ,
  ],
  SECRETARY: [
    P.MEMBERS_READ,
    P.MEMBERS_MANAGE,
    P.EVENTS_MANAGE,
    P.ATTENDANCE_READ,
    P.ATTENDANCE_MANAGE,
    P.CERTIFICATES_ISSUE,
    P.DOCUMENTS_READ,
    P.DOCUMENTS_MANAGE,
    P.ANNOUNCEMENTS_MANAGE,
  ],
  TREASURER: [P.MEMBERS_READ, P.FINANCE_READ, P.FINANCE_MANAGE, P.DOCUMENTS_READ],
  AUDITOR: [P.MEMBERS_READ, P.FINANCE_READ, P.DOCUMENTS_READ, P.AUDIT_READ],
  MEMBER: [],
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  PRESIDENT: 'Leads the organization; approves expenses and oversees all modules',
  VICE_PRESIDENT: 'Manages events and members; publishes announcements',
  SECRETARY: 'Keeps member, event, attendance and document records',
  TREASURER: 'Manages budgets, expenses, receipts and reimbursements',
  AUDITOR: 'Reviews financial records; read-only access to finance',
  MEMBER: 'Regular organization member',
};

/** Roles that count as officers (anything above a regular member). */
export const OFFICER_ROLES: RoleName[] = ['PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'TREASURER', 'AUDITOR'];
