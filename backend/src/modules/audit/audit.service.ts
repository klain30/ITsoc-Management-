import type { Prisma } from '@prisma/client';

import type { ActorContext } from '../../common/request.js';
import { paginated, toSkipTake, type PaginationInput } from '../../common/pagination.js';
import { prisma, type Db } from '../../lib/prisma.js';

export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.refresh_token_reuse',
  'auth.invitation_accepted',
  'auth.password_changed',
  'user.invitation_issued',
  'user.password_reset_issued',
  'user.role_changed',
  'user.status_changed',
  'member.created',
  'member.updated',
  'member.deleted',
  'position.created',
  'position.updated',
  'position.assigned',
  'position.assignment_ended',
  'event.created',
  'event.updated',
  'event.status_changed',
  'attendance.session_opened',
  'attendance.session_closed',
  'attendance.updated',
  'attendance.finalized',
  'certificate.issued',
  'certificate.revoked',
  'budget.created',
  'budget.updated',
  'expense.created',
  'expense.updated',
  'expense.approved',
  'expense.rejected',
  'expense.reimbursed',
  'receipt.uploaded',
  'document.uploaded',
  'document.updated',
  'document.deleted',
  'announcement.created',
  'announcement.updated',
  'announcement.published',
  'announcement.archived',
  'organization.updated',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntityType =
  | 'User'
  | 'Member'
  | 'Position'
  | 'PositionAssignment'
  | 'Event'
  | 'AttendanceSession'
  | 'Attendance'
  | 'Certificate'
  | 'Budget'
  | 'Expense'
  | 'Receipt'
  | 'Document'
  | 'Announcement'
  | 'Organization';

export type AuditEntry = {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  metadata?: Prisma.InputJsonObject;
};

/**
 * Append an audit record. Pass the transaction client when the audited
 * change happens inside a transaction so both commit (or roll back) together.
 */
export const recordAudit = (db: Db, actor: ActorContext, entry: AuditEntry) =>
  db.auditLog.create({
    data: {
      actorId: actor.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    },
  });

/**
 * Field-level diff for update audits: only fields whose value changed.
 * Values are stringified where needed so Decimal/Date survive JSON.
 */
export const diffFields = <T extends Record<string, unknown>>(before: T, after: Partial<T>) => {
  const changes: Record<string, { from: Prisma.InputJsonValue | null; to: Prisma.InputJsonValue | null }> = {};
  const normalise = (value: unknown): Prisma.InputJsonValue | null => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object' && 'toFixed' in (value as object)) return String(value);
    return value as Prisma.InputJsonValue;
  };
  for (const key of Object.keys(after)) {
    if (after[key] === undefined) continue;
    const from = normalise(before[key]);
    const to = normalise(after[key]);
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes[key] = { from, to };
    }
  }
  return changes;
};

export type AuditLogFilters = PaginationInput & {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
};

export const listAuditLogs = async (filters: AuditLogFilters) => {
  const where: Prisma.AuditLogWhereInput = {
    action: filters.action,
    entityType: filters.entityType,
    entityId: filters.entityId,
    actorId: filters.actorId,
    createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
  };

  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(filters),
      include: {
        actor: {
          select: { id: true, role: { select: { name: true } }, member: { select: { firstName: true, lastName: true, email: true } } },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const data = rows.map(({ actor, ...log }) => ({
    ...log,
    actor: actor
      ? {
          id: actor.id,
          name: `${actor.member.firstName} ${actor.member.lastName}`,
          email: actor.member.email,
          role: actor.role.name,
        }
      : null,
  }));

  return paginated(data, total, filters);
};
