import { Download, Receipt } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingBlock, StatusBadge } from '@/components/ui/Display';
import { Input, Select } from '@/components/ui/Form';
import { Pagination, SearchInput, Table, Td, Th, THead, Toolbar, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { downloadFile } from '@/lib/files';
import { formatCalendarDate, formatMoney } from '@/lib/format';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS, enumOptions } from '@/lib/labels';
import type { ExpenseCategory, ExpenseStatus } from '@/types/api';

import { useExpenses, type ExpenseFilters } from './api';

/** Filterable expense list; pass `budgetId` to scope it to one budget. */
export function ExpenseTable({ budgetId, initialStatus = '' }: { budgetId?: string; initialStatus?: ExpenseStatus | '' }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [filters, setFilters] = useState<ExpenseFilters>({ page: 1, budgetId, status: initialStatus, category: '', search: '', from: '', to: '' });
  const set = (patch: Partial<ExpenseFilters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  const query = useExpenses(filters);

  const exportCsv = () => {
    const params = new URLSearchParams(
      Object.entries({ ...filters, page: undefined }).filter(([, v]) => v) as [string, string][],
    ).toString();
    downloadFile(`/expenses/export.csv${params ? `?${params}` : ''}`, 'expenses.csv').catch(toast.error);
  };

  return (
    <>
      <Toolbar>
        <SearchInput value={filters.search ?? ''} onChange={(search) => set({ search })} placeholder="Search description" className="w-full sm:w-60" />
        <Select value={filters.status} onChange={(e) => set({ status: e.target.value as ExpenseStatus | '' })} className="w-auto" aria-label="Status">
          <option value="">All statuses</option>
          {enumOptions(EXPENSE_STATUS).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select value={filters.category} onChange={(e) => set({ category: e.target.value as ExpenseCategory | '' })} className="w-auto" aria-label="Category">
          <option value="">All categories</option>
          {enumOptions(EXPENSE_CATEGORY_LABELS).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} className="w-auto" aria-label="From date" />
        <Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} className="w-auto" aria-label="To date" />
        <div className="flex-1" />
        <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv}>
          Export CSV
        </Button>
      </Toolbar>
      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data && query.data.data.length > 0 ? (
        <>
          <Table>
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                {budgetId ? null : <Th>Budget</Th>}
                <Th>Category</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Receipts</Th>
              </tr>
            </THead>
            <tbody>
              {query.data.data.map((e) => (
                <Tr key={e.id} onClick={() => navigate(`/finance/expenses/${e.id}`)}>
                  <Td className="whitespace-nowrap text-fg-muted">{formatCalendarDate(e.expenseDate)}</Td>
                  <Td className="max-w-72">
                    <span className="block truncate font-medium">{e.description}</span>
                    {e.paidBy ? <span className="text-xs text-fg-subtle">Paid by {e.paidBy.name}</span> : null}
                  </Td>
                  {budgetId ? null : <Td className="max-w-48 truncate text-fg-muted">{e.budget.name}</Td>}
                  <Td className="text-fg-muted">{EXPENSE_CATEGORY_LABELS[e.category]}</Td>
                  <Td className="text-right font-medium tabular">{formatMoney(e.amount)}</Td>
                  <Td>
                    <StatusBadge value={e.status} map={EXPENSE_STATUS} />
                  </Td>
                  <Td className="text-fg-muted tabular">{e.receiptCount}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <div className="flex justify-end border-t border-border px-4 py-2 text-sm text-fg-muted">
            Total of filtered expenses: <span className="ml-1 font-semibold text-fg tabular">{formatMoney(query.data.meta.totalAmount)}</span>
          </div>
          <Pagination meta={query.data.meta} onPageChange={(page) => set({ page })} />
        </>
      ) : (
        <EmptyState icon={Receipt} title="No expenses match these filters" />
      )}
    </>
  );
}
