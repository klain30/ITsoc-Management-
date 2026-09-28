import { CircleDollarSign, Hourglass, Landmark, Plus, Receipt, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { BarList, ColumnChart, Meter, StatTile } from '@/components/ui/Charts';
import { Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui/Display';
import { Table, Td, Th, THead, Tr } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { useAuth } from '@/features/auth/useAuth';
import { formatMoney, formatMoneyCompact, formatPercent } from '@/lib/format';
import { BUDGET_STATUS, EXPENSE_CATEGORY_LABELS } from '@/lib/labels';

import { useBudgets, useFinanceSummary } from './api';
import { ExpenseTable } from './ExpenseTable';
import { BudgetFormDialog, ExpenseFormDialog } from './FinanceForms';

const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleString('en-PH', { month: 'short', timeZone: 'UTC' });

export default function FinancePage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'overview' | 'expenses'>('overview');
  const [dialog, setDialog] = useState<'budget' | 'expense' | null>(null);
  const summary = useFinanceSummary();
  const budgets = useBudgets();

  return (
    <>
      <PageHeader
        title="Finance"
        description="Budgets, expenses and receipts. All totals are calculated by the server from approved expenses."
        actions={
          can('finance:manage') ? (
            <>
              <Button variant="secondary" icon={Plus} onClick={() => setDialog('budget')}>
                New budget
              </Button>
              <Button icon={Receipt} onClick={() => setDialog('expense')}>
                File expense
              </Button>
            </>
          ) : null
        }
      />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'expenses', label: 'All expenses', count: summary.data?.counts.pending ? summary.data.counts.pending : undefined },
        ]}
      />

      {tab === 'expenses' ? (
        <Card>
          <ExpenseTable initialStatus={can('expenses:approve') && summary.data?.counts.pending ? 'PENDING' : ''} />
        </Card>
      ) : summary.isLoading ? (
        <LoadingBlock rows={8} />
      ) : summary.isError || !summary.data ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Total allocated" value={formatMoney(summary.data.totalAllocated)} icon={Landmark} hint="Active budgets" />
            <StatTile label="Spent" value={formatMoney(summary.data.totalSpent)} icon={CircleDollarSign} hint={`${formatPercent(summary.data.utilization)} of allocation`} />
            <StatTile label="Remaining" value={formatMoney(summary.data.remaining)} icon={Wallet} />
            <StatTile
              label="Pending approval"
              value={summary.data.counts.pending}
              icon={Hourglass}
              hint={`${formatMoney(summary.data.totalPending)} awaiting review`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Spending by category" description="Approved and reimbursed expenses" />
              <CardBody>
                <BarList
                  data={summary.data.byCategory.map((c) => ({
                    key: c.category,
                    label: EXPENSE_CATEGORY_LABELS[c.category],
                    value: Number(c.amount),
                    display: formatMoney(c.amount),
                  }))}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Monthly spending" description="Approved and reimbursed, last 6 months" />
              <CardBody>
                <ColumnChart
                  data={summary.data.monthly.map((m) => ({ key: m.month, label: monthLabel(m.month), value: Number(m.amount), display: formatMoneyCompact(m.amount) }))}
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Budgets" />
            {budgets.data && budgets.data.length > 0 ? (
              <Table>
                <THead>
                  <tr>
                    <Th>Budget</Th>
                    <Th className="text-right">Allocated</Th>
                    <Th className="text-right">Spent</Th>
                    <Th className="text-right">Remaining</Th>
                    <Th className="w-48">Utilization</Th>
                    <Th>Status</Th>
                  </tr>
                </THead>
                <tbody>
                  {budgets.data.map((b) => (
                    <Tr key={b.id} onClick={() => navigate(`/finance/budgets/${b.id}`)}>
                      <Td>
                        <span className="font-medium">{b.name}</span>
                        {b.event ? <span className="block text-xs text-fg-subtle">{b.event.name}</span> : null}
                      </Td>
                      <Td className="text-right tabular">{formatMoney(b.allocatedAmount)}</Td>
                      <Td className="text-right tabular">{formatMoney(b.spentAmount)}</Td>
                      <Td className="text-right font-medium tabular">{formatMoney(b.remainingAmount)}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Meter value={b.utilization} label={`${b.name} utilization`} />
                          <span className="w-12 text-right text-xs text-fg-muted tabular">{formatPercent(b.utilization)}</span>
                        </div>
                      </Td>
                      <Td>
                        <StatusBadge value={b.status} map={BUDGET_STATUS} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={Wallet} title="No budgets yet" />
            )}
          </Card>
        </div>
      )}

      {dialog === 'budget' ? <BudgetFormDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'expense' ? <ExpenseFormDialog onClose={() => setDialog(null)} /> : null}
    </>
  );
}
