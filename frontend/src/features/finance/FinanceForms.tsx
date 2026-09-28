import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { MemberPicker } from '@/features/members/MemberPicker';
import { ApiError, getPage } from '@/lib/api';
import { formatMoney, todayInput } from '@/lib/format';
import { EXPENSE_CATEGORY_LABELS, enumOptions } from '@/lib/labels';
import type { EventItem, ExpenseCategory, ExpenseDetail, Paginated } from '@/types/api';

import { useBudgets, useCreateBudget, useCreateExpense, useUpdateExpense } from './api';

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

const fieldError = (error: unknown, field: string) => (error instanceof ApiError ? error.fieldErrors[field]?.[0] : undefined);
const formLevel = (error: unknown) => (error instanceof ApiError && error.code !== 'VALIDATION_ERROR' ? error.message : null);

export function BudgetFormDialog({ onClose, defaultEventId }: { onClose: () => void; defaultEventId?: string }) {
  const toast = useToast();
  const create = useCreateBudget();
  const events = useQuery({
    queryKey: ['events', 'list', 'for-budget'],
    queryFn: () => getPage<Paginated<EventItem>>('/events', { params: { timeframe: 'all', pageSize: 100 } }),
  });
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [eventId, setEventId] = useState(defaultEventId ?? '');
  const [description, setDescription] = useState('');
  const valid = name.trim().length >= 3 && MONEY.test(amount) && Number(amount) > 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title="New budget"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            loading={create.isPending}
            onClick={() =>
              create.mutate(
                { name, allocatedAmount: amount, eventId: eventId || null, description: description || null },
                {
                  onSuccess: () => {
                    toast.success('Budget created.');
                    onClose();
                  },
                },
              )
            }
          >
            Create budget
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={formLevel(create.error)} />
        <Field label="Name" required error={fieldError(create.error, 'name')}>
          {(f) => <Input {...f} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hackathon 2026" />}
        </Field>
        <Field label="Allocated amount (₱)" required error={fieldError(create.error, 'allocatedAmount')} hint={MONEY.test(amount) ? formatMoney(amount) : undefined}>
          {(f) => <Input {...f} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="32000" />}
        </Field>
        <Field label="Event (optional)">
          {(f) => (
            <Select {...f} value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Not tied to an event</option>
              {events.data?.data
                .filter((e) => e.status !== 'CANCELLED')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Description">
          {(f) => <Textarea {...f} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

/** Create a new expense, or edit a pending one. */
export function ExpenseFormDialog({ onClose, expense, defaultBudgetId }: { onClose: () => void; expense?: ExpenseDetail; defaultBudgetId?: string }) {
  const toast = useToast();
  const budgets = useBudgets('ACTIVE');
  const create = useCreateExpense();
  const update = useUpdateExpense(expense?.id ?? '');
  const mutation = expense ? update : create;
  const [budgetId, setBudgetId] = useState(expense?.budget.id ?? defaultBudgetId ?? '');
  const [amount, setAmount] = useState(expense?.amount ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'FOOD');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ?? todayInput());
  const [paidBy, setPaidBy] = useState(expense?.paidBy?.id ?? '');
  const selected = budgets.data?.find((b) => b.id === budgetId);
  const valid = budgetId && MONEY.test(amount) && Number(amount) > 0 && description.trim().length >= 3 && expenseDate;

  const submit = () => {
    const body = { amount, category, description, expenseDate, paidByMemberId: paidBy || null };
    const done = {
      onSuccess: () => {
        toast.success(expense ? 'Expense updated.' : 'Expense filed. It now awaits approval.');
        onClose();
      },
    };
    if (expense) update.mutate(body, done);
    else create.mutate({ ...body, budgetId }, done);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={expense ? 'Edit expense' : 'File an expense'}
      description={expense ? 'Only pending expenses can be edited.' : 'The president reviews each expense before it counts against the budget.'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} loading={mutation.isPending} onClick={submit}>
            {expense ? 'Save changes' : 'File expense'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={formLevel(mutation.error)} />
        </div>
        <Field label="Budget" required className="sm:col-span-2" hint={selected ? `Remaining ${formatMoney(selected.remainingAmount)} · pending ${formatMoney(selected.pendingAmount)}` : undefined}>
          {(f) => (
            <Select {...f} value={budgetId} disabled={Boolean(expense)} onChange={(e) => setBudgetId(e.target.value)}>
              <option value="">Select a budget</option>
              {budgets.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Amount (₱)" required error={fieldError(mutation.error, 'amount')} hint={MONEY.test(amount) ? formatMoney(amount) : undefined}>
          {(f) => <Input {...f} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="12500" />}
        </Field>
        <Field label="Category" required>
          {(f) => (
            <Select {...f} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {enumOptions(EXPENSE_CATEGORY_LABELS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Description" required className="sm:col-span-2" error={fieldError(mutation.error, 'description')}>
          {(f) => <Input {...f} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Packed lunch for 60 participants" />}
        </Field>
        <Field label="Date" required error={fieldError(mutation.error, 'expenseDate')}>
          {(f) => <Input {...f} type="date" max={todayInput()} value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />}
        </Field>
        <Field label="Paid by (to reimburse)" hint="Leave empty if paid from organization funds.">
          {(f) => <MemberPicker id={f.id} value={paidBy} onChange={setPaidBy} />}
        </Field>
      </div>
    </Dialog>
  );
}
