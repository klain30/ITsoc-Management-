import { ExpenseStatus, Prisma, type ExpenseCategory } from '@prisma/client';

import { conflict, forbidden, notFound, unprocessable } from '../../common/errors.js';
import { paginated, toSkipTake } from '../../common/pagination.js';
import type { ActorContext } from '../../common/request.js';
import { money, sum, ZERO, type Decimal } from '../../lib/money.js';
import { prisma, type Db } from '../../lib/prisma.js';
import { storage } from '../../lib/storage.js';
import { diffFields, recordAudit } from '../audit/audit.service.js';
import { notifyMembers, notifyUsers } from '../notifications/notification.service.js';
import type {
  CreateBudgetInput,
  CreateExpenseInput,
  ListExpensesInput,
  UpdateBudgetInput,
  UpdateExpenseInput,
} from './finance.schemas.js';

type Actor = ActorContext & { userId: string };

/** Money that has actually left (or is committed to leave) the budget. */
const SPENT_STATUSES: ExpenseStatus[] = ['APPROVED', 'REIMBURSED'];
const MAX_RECEIPTS_PER_EXPENSE = 5;

const fullName = (m: { firstName: string; lastName: string } | null | undefined) => (m ? `${m.firstName} ${m.lastName}` : null);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

// ─── Budget totals (always computed server-side) ────────────────────────────

type BudgetTotals = { spent: Decimal; pending: Decimal; reimbursed: Decimal; expenseCount: number };

const computeTotals = async (db: Db, budgetIds: string[]) => {
  const totals = new Map<string, BudgetTotals>();
  for (const id of budgetIds) totals.set(id, { spent: ZERO, pending: ZERO, reimbursed: ZERO, expenseCount: 0 });
  if (budgetIds.length === 0) return totals;

  const groups = await db.expense.groupBy({
    by: ['budgetId', 'status'],
    where: { budgetId: { in: budgetIds } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  for (const group of groups) {
    const entry = totals.get(group.budgetId)!;
    const amount = group._sum.amount ?? ZERO;
    entry.expenseCount += group._count._all;
    if (SPENT_STATUSES.includes(group.status)) entry.spent = entry.spent.plus(amount);
    if (group.status === 'PENDING') entry.pending = entry.pending.plus(amount);
    if (group.status === 'REIMBURSED') entry.reimbursed = entry.reimbursed.plus(amount);
  }
  return totals;
};

const budgetSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  allocatedAmount: true,
  createdAt: true,
  updatedAt: true,
  event: { select: { id: true, name: true, startsAt: true } },
  createdBy: { select: { member: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.BudgetSelect;

type BudgetRow = Prisma.BudgetGetPayload<{ select: typeof budgetSelect }>;

const toBudgetDto = (budget: BudgetRow, totals: BudgetTotals) => {
  const remaining = budget.allocatedAmount.minus(totals.spent);
  return {
    id: budget.id,
    name: budget.name,
    description: budget.description,
    status: budget.status,
    event: budget.event,
    createdBy: fullName(budget.createdBy.member),
    createdAt: budget.createdAt,
    updatedAt: budget.updatedAt,
    allocatedAmount: money(budget.allocatedAmount),
    spentAmount: money(totals.spent),
    pendingAmount: money(totals.pending),
    reimbursedAmount: money(totals.reimbursed),
    remainingAmount: money(remaining),
    /** Remaining after pending expenses, if all of them were approved. */
    availableAmount: money(remaining.minus(totals.pending)),
    utilization: budget.allocatedAmount.isZero() ? 0 : Number(totals.spent.div(budget.allocatedAmount).times(100).toFixed(1)),
    expenseCount: totals.expenseCount,
  };
};

export const listBudgets = async (status?: 'ACTIVE' | 'CLOSED') => {
  const budgets = await prisma.budget.findMany({
    where: { status },
    select: budgetSelect,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  const totals = await computeTotals(
    prisma,
    budgets.map((b) => b.id),
  );
  return budgets.map((budget) => toBudgetDto(budget, totals.get(budget.id)!));
};

export const getBudget = async (id: string) => {
  const budget = await prisma.budget.findUnique({ where: { id }, select: budgetSelect });
  if (!budget) throw notFound('Budget');
  const [totals, byCategory] = await Promise.all([
    computeTotals(prisma, [id]),
    prisma.expense.groupBy({
      by: ['category'],
      where: { budgetId: id, status: { in: SPENT_STATUSES } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    }),
  ]);
  return {
    ...toBudgetDto(budget, totals.get(id)!),
    byCategory: byCategory.map((row) => ({ category: row.category, amount: money(row._sum.amount) })),
  };
};

export const createBudget = async (input: CreateBudgetInput, actor: Actor) => {
  if (input.eventId) {
    const event = await prisma.event.findUnique({ where: { id: input.eventId }, select: { status: true } });
    if (!event) throw notFound('Event');
    if (event.status === 'CANCELLED') throw unprocessable('Cannot create a budget for a cancelled event.');
  }
  return prisma.$transaction(async (tx) => {
    const budget = await tx.budget.create({ data: { ...input, createdById: actor.userId }, select: budgetSelect });
    await recordAudit(tx, actor, {
      action: 'budget.created',
      entityType: 'Budget',
      entityId: budget.id,
      metadata: { name: budget.name, allocatedAmount: money(budget.allocatedAmount), eventId: input.eventId },
    });
    return toBudgetDto(budget, { spent: ZERO, pending: ZERO, reimbursed: ZERO, expenseCount: 0 });
  });
};

export const updateBudget = async (id: string, input: UpdateBudgetInput, actor: Actor) => {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Budget" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.budget.findUnique({ where: { id } });
    if (!before) throw notFound('Budget');
    if (input.allocatedAmount) {
      const totals = (await computeTotals(tx, [id])).get(id)!;
      if (input.allocatedAmount.lessThan(totals.spent)) {
        throw unprocessable(`The allocation cannot be lower than the ₱${money(totals.spent)} already approved.`, 'BUDGET_BELOW_SPENT');
      }
    }
    if (input.status === 'CLOSED') {
      const pending = await tx.expense.count({ where: { budgetId: id, status: 'PENDING' } });
      if (pending > 0) throw unprocessable('Resolve all pending expenses before closing this budget.');
    }
    await tx.budget.update({ where: { id }, data: input });
    await recordAudit(tx, actor, {
      action: 'budget.updated',
      entityType: 'Budget',
      entityId: id,
      metadata: { changes: diffFields(before, input) },
    });
    return id;
  });
  return getBudget(result);
};

// ─── Expenses ───────────────────────────────────────────────────────────────

const expenseSelect = {
  id: true,
  amount: true,
  category: true,
  description: true,
  expenseDate: true,
  status: true,
  reviewedAt: true,
  reviewNote: true,
  reimbursedAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  budget: { select: { id: true, name: true, event: { select: { id: true, name: true } } } },
  paidBy: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { member: { select: { firstName: true, lastName: true } } } },
  reviewedBy: { select: { member: { select: { firstName: true, lastName: true } } } },
  _count: { select: { receipts: true } },
} satisfies Prisma.ExpenseSelect;

type ExpenseRow = Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>;

const toExpenseDto = ({ _count, createdBy, reviewedBy, paidBy, budget, ...expense }: ExpenseRow) => ({
  ...expense,
  amount: money(expense.amount),
  expenseDate: isoDate(expense.expenseDate),
  budget: { id: budget.id, name: budget.name },
  event: budget.event,
  paidBy: paidBy ? { id: paidBy.id, name: fullName(paidBy)! } : null,
  createdBy: fullName(createdBy.member),
  reviewedBy: fullName(reviewedBy?.member),
  receiptCount: _count.receipts,
});

export const listExpenses = async (input: ListExpensesInput) => {
  const where: Prisma.ExpenseWhereInput = {
    budgetId: input.budgetId,
    status: input.status,
    category: input.category,
    expenseDate: input.from || input.to ? { gte: input.from, lte: input.to } : undefined,
    description: input.search ? { contains: input.search, mode: 'insensitive' } : undefined,
  };
  const [rows, total, totalAmount] = await prisma.$transaction([
    prisma.expense.findMany({
      where,
      select: expenseSelect,
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      ...toSkipTake(input),
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
  ]);
  const page = paginated(rows.map(toExpenseDto), total, input);
  return { ...page, meta: { ...page.meta, totalAmount: money(totalAmount._sum.amount) } };
};

export const getExpense = async (id: string) => {
  const expense = await prisma.expense.findUnique({
    where: { id },
    select: {
      ...expenseSelect,
      receipts: {
        orderBy: { uploadedAt: 'asc' },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          uploadedAt: true,
          uploadedBy: { select: { member: { select: { firstName: true, lastName: true } } } },
        },
      },
      history: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          createdAt: true,
          changedBy: { select: { member: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
  });
  if (!expense) throw notFound('Expense');
  const { receipts, history, ...rest } = expense;
  return {
    ...toExpenseDto(rest),
    receipts: receipts.map(({ uploadedBy, ...receipt }) => ({ ...receipt, uploadedBy: fullName(uploadedBy.member) })),
    history: history.map(({ changedBy, ...change }) => ({ ...change, changedBy: fullName(changedBy.member) })),
  };
};

const assertPaidByMember = async (memberId: string | null | undefined) => {
  if (!memberId) return;
  const exists = await prisma.member.count({ where: { id: memberId } });
  if (!exists) throw notFound('Member (paid by)');
};

const assertValidExpenseDate = (date: Date | undefined) => {
  if (date && date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    throw unprocessable('Expense date cannot be in the future.');
  }
};

export const createExpense = async (input: CreateExpenseInput, actor: Actor) => {
  assertValidExpenseDate(input.expenseDate);
  await assertPaidByMember(input.paidByMemberId);

  const id = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Budget" WHERE id = ${input.budgetId} FOR UPDATE`;
    const budget = await tx.budget.findUnique({ where: { id: input.budgetId } });
    if (!budget) throw notFound('Budget');
    if (budget.status !== 'ACTIVE') throw unprocessable('This budget is closed.');
    const totals = (await computeTotals(tx, [budget.id])).get(budget.id)!;
    const remaining = budget.allocatedAmount.minus(totals.spent);
    if (input.amount.greaterThan(remaining)) {
      throw unprocessable(`This expense exceeds the ₱${money(remaining)} remaining in the budget.`, 'BUDGET_EXCEEDED');
    }

    const expense = await tx.expense.create({ data: { ...input, createdById: actor.userId }, select: { id: true } });
    await tx.expenseStatusChange.create({
      data: { expenseId: expense.id, fromStatus: null, toStatus: 'PENDING', changedById: actor.userId },
    });
    await recordAudit(tx, actor, {
      action: 'expense.created',
      entityType: 'Expense',
      entityId: expense.id,
      metadata: { budgetId: budget.id, amount: money(input.amount), category: input.category },
    });
    return expense.id;
  });
  return getExpense(id);
};

/** Only pending expenses can be edited; finalised ones are immutable (also enforced by a DB trigger). */
export const updateExpense = async (id: string, input: UpdateExpenseInput, actor: Actor) => {
  assertValidExpenseDate(input.expenseDate);
  await assertPaidByMember(input.paidByMemberId);
  const before = await prisma.expense.findUnique({ where: { id } });
  if (!before) throw notFound('Expense');
  if (before.status !== 'PENDING') throw unprocessable('Only pending expenses can be edited.', 'EXPENSE_FINALIZED');

  await prisma.$transaction(async (tx) => {
    const updated = await tx.expense.updateMany({ where: { id, status: 'PENDING' }, data: input });
    if (updated.count === 0) throw conflict('This expense was reviewed while you were editing it.');
    await recordAudit(tx, actor, {
      action: 'expense.updated',
      entityType: 'Expense',
      entityId: id,
      metadata: { changes: diffFields(before, input) },
    });
  });
  return getExpense(id);
};

/**
 * Status transitions. Each one is a conditional update on the current
 * status (so concurrent reviews cannot both win), writes an
 * ExpenseStatusChange row, an audit entry, and a notification.
 */
const transition = async (
  id: string,
  from: ExpenseStatus,
  to: ExpenseStatus,
  actor: Actor,
  note: string | null,
  check?: (tx: Prisma.TransactionClient, expense: { amount: Decimal; budgetId: string; createdById: string }) => Promise<void>,
) => {
  const expense = await prisma.expense.findUnique({
    where: { id },
    select: { id: true, status: true, amount: true, budgetId: true, createdById: true, paidByMemberId: true, description: true },
  });
  if (!expense) throw notFound('Expense');
  if (expense.status !== from) {
    throw unprocessable(`Only ${from.toLowerCase()} expenses can be marked ${to.toLowerCase()}.`, 'INVALID_STATUS_TRANSITION');
  }

  await prisma.$transaction(async (tx) => {
    if (check) await check(tx, expense);
    const reviewed = to === 'APPROVED' || to === 'REJECTED';
    const updated = await tx.expense.updateMany({
      where: { id, status: from },
      data: {
        status: to,
        ...(reviewed ? { reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: note } : {}),
        ...(to === 'REIMBURSED' ? { reimbursedAt: new Date() } : {}),
      },
    });
    if (updated.count === 0) throw conflict('This expense was changed by someone else. Refresh and try again.');

    await tx.expenseStatusChange.create({ data: { expenseId: id, fromStatus: from, toStatus: to, changedById: actor.userId, note } });

    const action = to === 'APPROVED' ? 'expense.approved' : to === 'REJECTED' ? 'expense.rejected' : 'expense.reimbursed';
    await recordAudit(tx, actor, {
      action,
      entityType: 'Expense',
      entityId: id,
      metadata: { amount: money(expense.amount), budgetId: expense.budgetId, note },
    });

    const label = `₱${money(expense.amount)} — ${expense.description}`;
    if (to === 'APPROVED' || to === 'REJECTED') {
      await notifyUsers(tx, [expense.createdById], {
        type: to === 'APPROVED' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
        title: to === 'APPROVED' ? 'Expense approved' : 'Expense rejected',
        body: note ? `${label}. Note: ${note}` : label,
        link: `/finance/expenses/${id}`,
      });
    }
    if (to === 'REIMBURSED' && expense.paidByMemberId) {
      await notifyMembers(tx, [expense.paidByMemberId], {
        type: 'EXPENSE_REIMBURSED',
        title: 'You have been reimbursed',
        body: label,
      });
    }
  });
  return getExpense(id);
};

export const approveExpense = (id: string, note: string | null, actor: Actor) =>
  transition(id, 'PENDING', 'APPROVED', actor, note, async (tx, expense) => {
    // Separation of duties: whoever files an expense cannot approve it.
    if (expense.createdById === actor.userId) throw forbidden('You cannot approve an expense you filed.');
    // Lock the budget so two approvals cannot jointly overspend it.
    await tx.$queryRaw`SELECT id FROM "Budget" WHERE id = ${expense.budgetId} FOR UPDATE`;
    const budget = await tx.budget.findUniqueOrThrow({ where: { id: expense.budgetId } });
    const totals = (await computeTotals(tx, [budget.id])).get(budget.id)!;
    const remaining = budget.allocatedAmount.minus(totals.spent);
    if (expense.amount.greaterThan(remaining)) {
      throw unprocessable(`Approving this would exceed the budget: only ₱${money(remaining)} remains.`, 'BUDGET_EXCEEDED');
    }
  });

export const rejectExpense = (id: string, note: string, actor: Actor) =>
  transition(id, 'PENDING', 'REJECTED', actor, note, async (_tx, expense) => {
    if (expense.createdById === actor.userId) throw forbidden('You cannot review an expense you filed.');
  });

export const reimburseExpense = (id: string, note: string | null, actor: Actor) =>
  transition(id, 'APPROVED', 'REIMBURSED', actor, note, async (tx) => {
    const receipts = await tx.receipt.count({ where: { expenseId: id } });
    if (receipts === 0) throw unprocessable('Upload at least one receipt before recording the reimbursement.', 'RECEIPT_REQUIRED');
  });

// ─── Receipts ───────────────────────────────────────────────────────────────

export const addReceipt = async (expenseId: string, file: { buffer: Buffer; originalname: string }, actor: Actor) => {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { status: true, _count: { select: { receipts: true } } },
  });
  if (!expense) throw notFound('Expense');
  if (expense.status === 'REJECTED' || expense.status === 'REIMBURSED') {
    throw unprocessable('Receipts can only be added to pending or approved expenses.');
  }
  if (expense._count.receipts >= MAX_RECEIPTS_PER_EXPENSE) {
    throw unprocessable(`An expense can have at most ${MAX_RECEIPTS_PER_EXPENSE} receipts.`);
  }

  const stored = await storage.save('receipt', file);
  try {
    return await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: {
          expenseId,
          fileKey: stored.key,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          uploadedById: actor.userId,
        },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
      });
      await recordAudit(tx, actor, {
        action: 'receipt.uploaded',
        entityType: 'Receipt',
        entityId: receipt.id,
        metadata: { expenseId, fileName: stored.originalName, sizeBytes: stored.sizeBytes },
      });
      return receipt;
    });
  } catch (error) {
    await storage.remove(stored.key); // do not leave orphaned files behind
    throw error;
  }
};

export const openReceipt = async (receiptId: string) => {
  const receipt = await prisma.receipt.findUnique({ where: { id: receiptId } });
  if (!receipt) throw notFound('Receipt');
  return { stream: storage.open(receipt.fileKey), mimeType: receipt.mimeType, fileName: receipt.originalName };
};

// ─── Summary (dashboards & reports) ─────────────────────────────────────────

export const getFinanceSummary = async () => {
  const activeBudgets = await prisma.budget.findMany({ where: { status: 'ACTIVE' }, select: budgetSelect, orderBy: { createdAt: 'desc' } });
  const ids = activeBudgets.map((b) => b.id);
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5, 1);
  sixMonthsAgo.setUTCHours(0, 0, 0, 0);

  const [totals, byStatus, byCategory, monthly] = await Promise.all([
    computeTotals(prisma, ids),
    prisma.expense.groupBy({
      by: ['status'],
      where: { budgetId: { in: ids } },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    }),
    prisma.expense.groupBy({
      by: ['category'],
      where: { budgetId: { in: ids }, status: { in: SPENT_STATUSES } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    }),
    prisma.$queryRaw<{ month: string; total: Decimal }[]>`
      SELECT to_char(date_trunc('month', "expenseDate"), 'YYYY-MM') AS month, SUM("amount") AS total
      FROM "Expense"
      WHERE "status" IN ('APPROVED', 'REIMBURSED') AND "expenseDate" >= ${sixMonthsAgo}
      GROUP BY 1 ORDER BY 1`,
  ]);

  const budgets = activeBudgets.map((budget) => toBudgetDto(budget, totals.get(budget.id)!));
  const allocated = sum(activeBudgets.map((b) => b.allocatedAmount));
  const spent = sum([...totals.values()].map((t) => t.spent));
  const pending = sum([...totals.values()].map((t) => t.pending));
  const statusCount = (status: ExpenseStatus) => byStatus.find((row) => row.status === status)?._count._all ?? 0;

  return {
    totalAllocated: money(allocated),
    totalSpent: money(spent),
    totalPending: money(pending),
    remaining: money(allocated.minus(spent)),
    utilization: allocated.isZero() ? 0 : Number(spent.div(allocated).times(100).toFixed(1)),
    counts: {
      pending: statusCount('PENDING'),
      approved: statusCount('APPROVED'),
      rejected: statusCount('REJECTED'),
      reimbursed: statusCount('REIMBURSED'),
    },
    byCategory: byCategory.map((row) => ({ category: row.category as ExpenseCategory, amount: money(row._sum.amount) })),
    monthly: monthly.map((row) => ({ month: row.month, amount: money(row.total) })),
    budgets,
  };
};

export const listExpensesForExport = (filters: Omit<ListExpensesInput, 'page' | 'pageSize'>) =>
  prisma.expense
    .findMany({
      where: {
        budgetId: filters.budgetId,
        status: filters.status,
        category: filters.category,
        expenseDate: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
      },
      select: expenseSelect,
      orderBy: { expenseDate: 'asc' },
      take: 10_000,
    })
    .then((rows) => rows.map(toExpenseDto));
