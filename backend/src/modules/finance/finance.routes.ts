import { Router, type Request } from 'express';

import { PERMISSIONS } from '../../auth/permissions.js';
import { sendCsv, toCsv } from '../../common/csv.js';
import { badRequest } from '../../common/errors.js';
import { actorContext, getAuth, param } from '../../common/request.js';
import { contentDisposition } from '../../lib/storage.js';
import { authorize } from '../../middleware/authorize.js';
import { singleFileUpload } from '../../middleware/upload.js';
import {
  createBudgetSchema,
  createExpenseSchema,
  listBudgetsSchema,
  listExpensesSchema,
  rejectSchema,
  reviewSchema,
  updateBudgetSchema,
  updateExpenseSchema,
} from './finance.schemas.js';
import * as financeService from './finance.service.js';

const actor = (req: Request) => ({ ...actorContext(req), userId: getAuth(req).userId });

/** Mounted at /budgets. */
export const budgetRouter = Router();

budgetRouter.get('/', authorize(PERMISSIONS.FINANCE_READ), async (req, res) => {
  const { status } = listBudgetsSchema.parse(req.query);
  res.json({ data: await financeService.listBudgets(status) });
});

budgetRouter.post('/', authorize(PERMISSIONS.FINANCE_MANAGE), async (req, res) => {
  res.status(201).json({ data: await financeService.createBudget(createBudgetSchema.parse(req.body), actor(req)) });
});

budgetRouter.get('/:id', authorize(PERMISSIONS.FINANCE_READ), async (req, res) => {
  res.json({ data: await financeService.getBudget(param(req, 'id')) });
});

budgetRouter.patch('/:id', authorize(PERMISSIONS.FINANCE_MANAGE), async (req, res) => {
  res.json({ data: await financeService.updateBudget(param(req, 'id'), updateBudgetSchema.parse(req.body), actor(req)) });
});

/** Mounted at /expenses. There is intentionally no DELETE: rejected expenses stay on record. */
export const expenseRouter = Router();

expenseRouter.get('/', authorize(PERMISSIONS.FINANCE_READ), async (req, res) => {
  res.json(await financeService.listExpenses(listExpensesSchema.parse(req.query)));
});

expenseRouter.get('/export.csv', authorize(PERMISSIONS.FINANCE_READ), async (req, res) => {
  const filters = listExpensesSchema.parse(req.query);
  const rows = await financeService.listExpensesForExport(filters);
  const csv = toCsv(rows, [
    { header: 'Date', value: (r) => r.expenseDate },
    { header: 'Budget', value: (r) => r.budget.name },
    { header: 'Event', value: (r) => r.event?.name },
    { header: 'Category', value: (r) => r.category },
    { header: 'Description', value: (r) => r.description },
    { header: 'Amount (PHP)', value: (r) => r.amount },
    { header: 'Status', value: (r) => r.status },
    { header: 'Paid by', value: (r) => r.paidBy?.name },
    { header: 'Filed by', value: (r) => r.createdBy },
    { header: 'Reviewed by', value: (r) => r.reviewedBy },
    { header: 'Review note', value: (r) => r.reviewNote },
    { header: 'Receipts', value: (r) => r.receiptCount },
  ]);
  sendCsv(res, `expenses-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

expenseRouter.post('/', authorize(PERMISSIONS.FINANCE_MANAGE), async (req, res) => {
  res.status(201).json({ data: await financeService.createExpense(createExpenseSchema.parse(req.body), actor(req)) });
});

expenseRouter.get('/:id', authorize(PERMISSIONS.FINANCE_READ), async (req, res) => {
  res.json({ data: await financeService.getExpense(param(req, 'id')) });
});

expenseRouter.patch('/:id', authorize(PERMISSIONS.FINANCE_MANAGE), async (req, res) => {
  res.json({ data: await financeService.updateExpense(param(req, 'id'), updateExpenseSchema.parse(req.body), actor(req)) });
});

expenseRouter.patch('/:id/approve', authorize(PERMISSIONS.EXPENSES_APPROVE), async (req, res) => {
  const { note } = reviewSchema.parse(req.body ?? {});
  res.json({ data: await financeService.approveExpense(param(req, 'id'), note, actor(req)) });
});

expenseRouter.patch('/:id/reject', authorize(PERMISSIONS.EXPENSES_APPROVE), async (req, res) => {
  const { note } = rejectSchema.parse(req.body);
  res.json({ data: await financeService.rejectExpense(param(req, 'id'), note, actor(req)) });
});

expenseRouter.patch('/:id/reimburse', authorize(PERMISSIONS.FINANCE_MANAGE), async (req, res) => {
  const { note } = reviewSchema.parse(req.body ?? {});
  res.json({ data: await financeService.reimburseExpense(param(req, 'id'), note, actor(req)) });
});

expenseRouter.post('/:id/receipts', authorize(PERMISSIONS.FINANCE_MANAGE), singleFileUpload('file'), async (req, res) => {
  if (!req.file) throw badRequest('Attach the receipt in the "file" field.');
  res.status(201).json({ data: await financeService.addReceipt(param(req, 'id'), req.file, actor(req)) });
});

/** Mounted at /receipts. */
export const receiptRouter = Router();

receiptRouter.get('/:id/file', authorize(PERMISSIONS.FINANCE_READ), async (req, res) => {
  const { stream, mimeType, fileName } = await financeService.openReceipt(param(req, 'id'));
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', contentDisposition(fileName, true));
  res.setHeader('Cache-Control', 'private, no-store');
  stream.on('error', () => res.status(404).end());
  stream.pipe(res);
});

/** Mounted at /finance. */
export const financeRouter = Router();

financeRouter.get('/summary', authorize(PERMISSIONS.FINANCE_READ), async (_req, res) => {
  res.json({ data: await financeService.getFinanceSummary() });
});
