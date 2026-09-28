import { describe, expect, it } from 'vitest';

import { prisma } from '../src/lib/prisma.js';
import * as financeService from '../src/modules/finance/finance.service.js';
import { api, auth, createUser } from './helpers.js';

const today = () => new Date().toISOString().slice(0, 10);

// Minimal valid PDF header — enough for magic-byte detection.
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

const setup = async () => {
  const treasurer = await createUser('TREASURER');
  const president = await createUser('PRESIDENT');
  const budget = await api()
    .post('/api/v1/budgets')
    .set(auth(treasurer))
    .send({ name: 'CCIS Foundation Anniversary', allocatedAmount: '32000' });
  expect(budget.status).toBe(201);
  const addExpense = (amount: string, category = 'FOOD') =>
    api()
      .post('/api/v1/expenses')
      .set(auth(treasurer))
      .send({ budgetId: budget.body.data.id, amount, category, description: `${category} expense`, expenseDate: today() });
  return { treasurer, president, budgetId: budget.body.data.id as string, addExpense };
};

describe('finance', () => {
  it('computes budget totals on the server (the spec example: ₱32,000 − ₱28,000 = ₱4,000)', async () => {
    const { president, budgetId, addExpense } = await setup();
    const amounts: [string, string][] = [
      ['12500', 'FOOD'],
      ['8000', 'DECORATIONS'],
      ['3500', 'MATERIALS'],
      ['2000', 'PRINTING'],
      ['2000', 'PRIZES'],
    ];
    for (const [amount, category] of amounts) {
      const created = await addExpense(amount, category);
      expect(created.status).toBe(201);
      await api().patch(`/api/v1/expenses/${created.body.data.id}/approve`).set(auth(president)).send({}).expect(200);
    }
    const budget = await api().get(`/api/v1/budgets/${budgetId}`).set(auth(president));
    expect(budget.body.data).toMatchObject({
      allocatedAmount: '32000.00',
      spentAmount: '28000.00',
      remainingAmount: '4000.00',
      utilization: 87.5,
    });
    expect(budget.body.data.byCategory[0]).toEqual({ category: 'FOOD', amount: '12500.00' });
  });

  it('keeps decimal precision (no floating-point drift)', async () => {
    const { president, budgetId, addExpense } = await setup();
    for (const amount of ['0.10', '0.20']) {
      const created = await addExpense(amount);
      await api().patch(`/api/v1/expenses/${created.body.data.id}/approve`).set(auth(president)).expect(200);
    }
    const budget = await api().get(`/api/v1/budgets/${budgetId}`).set(auth(president));
    expect(budget.body.data.spentAmount).toBe('0.30');
  });

  it('validates amounts', async () => {
    const { addExpense } = await setup();
    expect((await addExpense('-5')).status).toBe(400);
    expect((await addExpense('10.999')).status).toBe(400);
    expect((await addExpense('abc')).status).toBe(400);
    expect((await addExpense('40000')).body.error.code).toBe('BUDGET_EXCEEDED');
  });

  it('refuses approvals that would overspend the budget', async () => {
    const { president, addExpense } = await setup();
    const a = await addExpense('20000');
    const b = await addExpense('15000');
    await api().patch(`/api/v1/expenses/${a.body.data.id}/approve`).set(auth(president)).expect(200);
    const over = await api().patch(`/api/v1/expenses/${b.body.data.id}/approve`).set(auth(president));
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe('BUDGET_EXCEEDED');
  });

  it('enforces separation of duties: the filer cannot approve their own expense', async () => {
    const { treasurer, addExpense } = await setup();
    const created = await addExpense('500');
    // No default role has both permissions, so call the service directly.
    await expect(financeService.approveExpense(created.body.data.id, null, { userId: treasurer.userId })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('makes finalised expenses immutable, in the API and in the database', async () => {
    const { treasurer, president, addExpense } = await setup();
    const created = await addExpense('1000');
    const id = created.body.data.id as string;
    await api().patch(`/api/v1/expenses/${id}/reject`).set(auth(president)).send({ note: 'Not an org expense' }).expect(200);

    const edit = await api().patch(`/api/v1/expenses/${id}`).set(auth(treasurer)).send({ amount: '1' });
    expect(edit.body.error.code).toBe('EXPENSE_FINALIZED');
    await expect(prisma.expense.update({ where: { id }, data: { amount: 1 } })).rejects.toThrow(/cannot be modified/);
    await expect(prisma.expense.delete({ where: { id } })).rejects.toThrow(/cannot be deleted/);

    const detail = await api().get(`/api/v1/expenses/${id}`).set(auth(president));
    expect(detail.body.data.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['PENDING', 'REJECTED']);
    await expect(prisma.expenseStatusChange.deleteMany({ where: { expenseId: id } })).rejects.toThrow(/append-only/);
  });

  it('requires a receipt before reimbursement and validates the real file type', async () => {
    const { treasurer, president, addExpense } = await setup();
    const created = await addExpense('750');
    const id = created.body.data.id as string;
    await api().patch(`/api/v1/expenses/${id}/approve`).set(auth(president)).expect(200);

    const noReceipt = await api().patch(`/api/v1/expenses/${id}/reimburse`).set(auth(treasurer)).send({});
    expect(noReceipt.body.error.code).toBe('RECEIPT_REQUIRED');

    const fake = await api()
      .post(`/api/v1/expenses/${id}/receipts`)
      .set(auth(treasurer))
      .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'receipt.pdf', contentType: 'application/pdf' });
    expect(fake.status).toBe(400);

    const real = await api()
      .post(`/api/v1/expenses/${id}/receipts`)
      .set(auth(treasurer))
      .attach('file', PDF_BYTES, { filename: 'official receipt.pdf', contentType: 'application/pdf' });
    expect(real.status).toBe(201);

    const file = await api().get(`/api/v1/receipts/${real.body.data.id}/file`).set(auth(president));
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');

    const reimbursed = await api().patch(`/api/v1/expenses/${id}/reimburse`).set(auth(treasurer)).send({});
    expect(reimbursed.body.data.status).toBe('REIMBURSED');
  });

  it('exports expenses as CSV with formula injection neutralised', async () => {
    const { treasurer, budgetId } = await setup();
    await api()
      .post('/api/v1/expenses')
      .set(auth(treasurer))
      .send({ budgetId, amount: '10', category: 'OTHER', description: '=HYPERLINK("http://evil")', expenseDate: today() })
      .expect(201);
    const csv = await api().get('/api/v1/expenses/export.csv').set(auth(treasurer));
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});
