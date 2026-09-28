import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { conflict, notFound, unprocessable } from '../../common/errors.js';
import type { ActorContext } from '../../common/request.js';
import { prisma } from '../../lib/prisma.js';
import { diffFields, recordAudit } from '../audit/audit.service.js';

export const positionInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((value) => value || null),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(100),
  isActive: z.boolean().default(true),
});

export const updatePositionSchema = positionInputSchema.partial().strict();

export const assignPositionSchema = z.object({
  memberId: z.string().min(1),
  startDate: z.coerce.date(),
});

export const endAssignmentSchema = z.object({
  endDate: z.coerce.date(),
});

const dateOnly = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const listPositions = async (includeInactive: boolean) => {
  const positions = await prisma.position.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      assignments: {
        where: { endDate: null },
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          startDate: true,
          member: { select: { id: true, firstName: true, lastName: true, studentId: true } },
        },
      },
    },
  });
  return positions.map(({ assignments, ...position }) => ({
    ...position,
    holders: assignments.map((assignment) => ({
      assignmentId: assignment.id,
      since: assignment.startDate,
      memberId: assignment.member.id,
      name: `${assignment.member.firstName} ${assignment.member.lastName}`,
      studentId: assignment.member.studentId,
    })),
  }));
};

export const createPosition = async (input: z.infer<typeof positionInputSchema>, actor: ActorContext) =>
  prisma.$transaction(async (tx) => {
    const position = await tx.position.create({ data: input });
    await recordAudit(tx, actor, { action: 'position.created', entityType: 'Position', entityId: position.id, metadata: { name: position.name } });
    return position;
  });

export const updatePosition = async (id: string, input: z.infer<typeof updatePositionSchema>, actor: ActorContext) => {
  const before = await prisma.position.findUnique({ where: { id } });
  if (!before) throw notFound('Position');
  if (input.isActive === false) {
    const open = await prisma.positionAssignment.count({ where: { positionId: id, endDate: null } });
    if (open > 0) throw unprocessable('End the current assignments before deactivating this position.');
  }
  return prisma.$transaction(async (tx) => {
    const position = await tx.position.update({ where: { id }, data: input });
    await recordAudit(tx, actor, {
      action: 'position.updated',
      entityType: 'Position',
      entityId: id,
      metadata: { changes: diffFields(before, input) },
    });
    return position;
  });
};

/**
 * Assigns a member to a position. If they already hold a position, that
 * term is closed the day the new one starts (a member holds one position
 * at a time — also enforced by a partial unique index).
 */
export const assignPosition = async (
  positionId: string,
  input: z.infer<typeof assignPositionSchema>,
  actor: ActorContext & { userId: string },
) => {
  const startDate = dateOnly(input.startDate);
  const [position, member] = await Promise.all([
    prisma.position.findUnique({ where: { id: positionId } }),
    prisma.member.findUnique({ where: { id: input.memberId }, select: { id: true, status: true, firstName: true, lastName: true } }),
  ]);
  if (!position) throw notFound('Position');
  if (!position.isActive) throw unprocessable('This position is inactive.');
  if (!member) throw notFound('Member');
  if (member.status !== 'ACTIVE') throw unprocessable('Only active members can hold officer positions.');

  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.positionAssignment.findFirst({ where: { memberId: member.id, endDate: null } });
      if (current) {
        if (current.positionId === positionId) throw conflict('This member already holds this position.');
        if (current.startDate > startDate) throw unprocessable('The new term cannot start before the current one.');
        await tx.positionAssignment.update({ where: { id: current.id }, data: { endDate: startDate } });
        await recordAudit(tx, actor, {
          action: 'position.assignment_ended',
          entityType: 'PositionAssignment',
          entityId: current.id,
          metadata: { memberId: member.id, positionId: current.positionId, endDate: startDate.toISOString() },
        });
      }
      const assignment = await tx.positionAssignment.create({
        data: { positionId, memberId: member.id, startDate, assignedById: actor.userId },
      });
      await recordAudit(tx, actor, {
        action: 'position.assigned',
        entityType: 'PositionAssignment',
        entityId: assignment.id,
        metadata: { memberId: member.id, member: `${member.firstName} ${member.lastName}`, position: position.name },
      });
      return assignment;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict('This member was assigned a position at the same time. Refresh and try again.');
    }
    throw error;
  }
};

export const endAssignment = async (assignmentId: string, endDateInput: Date, actor: ActorContext) => {
  const assignment = await prisma.positionAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw notFound('Assignment');
  if (assignment.endDate) throw unprocessable('This term has already ended.');
  const endDate = dateOnly(endDateInput);
  if (endDate < assignment.startDate) throw unprocessable('End date cannot be before the start date.');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.positionAssignment.update({ where: { id: assignmentId }, data: { endDate } });
    await recordAudit(tx, actor, {
      action: 'position.assignment_ended',
      entityType: 'PositionAssignment',
      entityId: assignmentId,
      metadata: { memberId: assignment.memberId, positionId: assignment.positionId, endDate: endDate.toISOString() },
    });
    return updated;
  });
};
