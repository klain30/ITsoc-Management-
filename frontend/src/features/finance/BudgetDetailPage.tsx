import { ArrowLeft, Lock, Pencil, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { BarList, Meter, StatTile } from '@/components/ui/Charts';
import { Card, CardBody, CardHeader, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui/Display';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { formatMoney, formatPercent } from '@/lib/format';
import { BUDGET_STATUS, EXPENSE_CATEGORY_LABELS } from '@/lib/labels';

import { useBudget, useUpdateBudget } from './api';
import { ExpenseTable } from './ExpenseTable';
import { ExpenseFormDialog } from './FinanceForms';

export default function BudgetDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const query = useBudget(id);
  const update = useUpdateBudget(id);
  const [filing, setFiling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [amount, setAmount] = useState('');

  if (query.isLoading) return <LoadingBlock rows={8} />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const b = query.data;
  const manage = can('finance:manage');

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/finance" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft size={14} aria-hidden /> Finance
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            {b.name} <StatusBadge value={b.status} map={BUDGET_STATUS} />
          </span>
        }
        description={b.event ? `For ${b.event.name}` : b.description ?? undefined}
        actions={
          manage && b.status === 'ACTIVE' ? (
            <>
              <Button
                variant="secondary"
                icon={Pencil}
                onClick={() => {
                  setAmount(b.allocatedAmount);
                  setEditing(true);
                }}
              >
                Change allocation
              </Button>
              <Button variant="secondary" icon={Lock} onClick={() => setClosing(true)}>
                Close budget
              </Button>
              <Button icon={Receipt} onClick={() => setFiling(true)}>
                File expense
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Allocated" value={formatMoney(b.allocatedAmount)} />
        <StatTile label="Spent" value={formatMoney(b.spentAmount)} hint={`${formatMoney(b.reimbursedAmount)} reimbursed`} />
        <StatTile label="Remaining" value={formatMoney(b.remainingAmount)} hint={`${formatMoney(b.availableAmount)} if all pending are approved`} />
        <StatTile label="Pending" value={formatMoney(b.pendingAmount)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Utilization" />
          <CardBody className="space-y-3">
            <p className="text-3xl font-semibold">{formatPercent(b.utilization)}</p>
            <Meter value={b.utilization} label="Budget utilization" />
            <p className="text-sm text-fg-muted">
              {formatMoney(b.spentAmount)} of {formatMoney(b.allocatedAmount)} spent across {b.expenseCount} expenses.
            </p>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="By category" description="Approved and reimbursed" />
          <CardBody>
            <BarList
              data={b.byCategory.map((c) => ({ key: c.category, label: EXPENSE_CATEGORY_LABELS[c.category], value: Number(c.amount), display: formatMoney(c.amount) }))}
            />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Expenses" />
        <ExpenseTable budgetId={b.id} />
      </Card>

      {filing ? <ExpenseFormDialog onClose={() => setFiling(false)} defaultBudgetId={b.id} /> : null}
      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        title="Change allocation"
        description={`Cannot go below the ${formatMoney(b.spentAmount)} already spent.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              loading={update.isPending}
              disabled={!/^\d{1,10}(\.\d{1,2})?$/.test(amount)}
              onClick={() =>
                update.mutate(
                  { allocatedAmount: amount },
                  {
                    onSuccess: () => {
                      toast.success('Allocation updated.');
                      setEditing(false);
                    },
                    onError: toast.error,
                  },
                )
              }
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="Allocated amount (₱)" hint={amount ? formatMoney(amount) : undefined}>
          {(f) => <Input {...f} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />}
        </Field>
      </Dialog>
      <ConfirmDialog
        open={closing}
        onClose={() => setClosing(false)}
        title="Close this budget?"
        description="No new expenses can be filed against a closed budget. All pending expenses must be resolved first."
        confirmLabel="Close budget"
        loading={update.isPending}
        onConfirm={() =>
          update.mutate(
            { status: 'CLOSED' },
            {
              onSuccess: () => {
                toast.success('Budget closed.');
                setClosing(false);
              },
              onError: (e) => {
                setClosing(false);
                toast.error(e);
              },
            },
          )
        }
      />
    </>
  );
}
