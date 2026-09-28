import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getData, getPage, patchData, postData } from '@/lib/api';
import type { Budget, BudgetDetail, ExpenseCategory, ExpenseDetail, ExpenseStatus, Expense, FinanceSummary, Paginated } from '@/types/api';

export type ExpenseFilters = {
  page: number;
  budgetId?: string;
  status?: ExpenseStatus | '';
  category?: ExpenseCategory | '';
  from?: string;
  to?: string;
  search?: string;
};

export type ExpenseInput = {
  budgetId: string;
  amount: string;
  category: ExpenseCategory;
  description: string;
  expenseDate: string;
  paidByMemberId?: string | null;
};

const clean = <T extends object>(params: T) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined));

export const useFinanceSummary = () => useQuery({ queryKey: ['finance', 'summary'], queryFn: () => getData<FinanceSummary>('/finance/summary') });

export const useBudgets = (status?: 'ACTIVE' | 'CLOSED') =>
  useQuery({ queryKey: ['finance', 'budgets', status], queryFn: () => getData<Budget[]>('/budgets', { params: clean({ status }) }) });

export const useBudget = (id: string) => useQuery({ queryKey: ['finance', 'budget', id], queryFn: () => getData<BudgetDetail>(`/budgets/${id}`) });

export const useExpenses = (filters: ExpenseFilters) =>
  useQuery({
    queryKey: ['finance', 'expenses', filters],
    queryFn: () => getPage<Paginated<Expense, { totalAmount: string }>>('/expenses', { params: clean(filters) }),
    placeholderData: keepPreviousData,
  });

export const useExpense = (id: string) => useQuery({ queryKey: ['finance', 'expense', id], queryFn: () => getData<ExpenseDetail>(`/expenses/${id}`) });

const useInvalidateFinance = () => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['finance'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
};

export const useCreateBudget = () => {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: { name: string; description?: string | null; eventId?: string | null; allocatedAmount: string }) =>
      postData<Budget>('/budgets', input),
    onSuccess: invalidate,
  });
};

export const useUpdateBudget = (id: string) => {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: Partial<{ name: string; description: string | null; allocatedAmount: string; status: 'ACTIVE' | 'CLOSED' }>) =>
      patchData<BudgetDetail>(`/budgets/${id}`, input),
    onSuccess: invalidate,
  });
};

export const useCreateExpense = () => {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (input: ExpenseInput) => postData<ExpenseDetail>('/expenses', input), onSuccess: invalidate });
};

export const useUpdateExpense = (id: string) => {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (input: Partial<Omit<ExpenseInput, 'budgetId'>>) => patchData<ExpenseDetail>(`/expenses/${id}`, input),
    onSuccess: invalidate,
  });
};

export const useExpenseAction = (id: string) => {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ action, note }: { action: 'approve' | 'reject' | 'reimburse'; note?: string }) =>
      patchData<ExpenseDetail>(`/expenses/${id}/${action}`, { note: note || null }),
    onSuccess: invalidate,
  });
};

export const useUploadReceipt = (id: string) => {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return postData(`/expenses/${id}/receipts`, body);
    },
    onSuccess: invalidate,
  });
};
