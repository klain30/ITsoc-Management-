import { ArrowLeft, CircleCheck, CircleX, Eye, HandCoins, Pencil, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DetailList, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui/Display';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { openFile } from '@/lib/files';
import { formatCalendarDate, formatDateTime, formatFileSize, formatMoney } from '@/lib/format';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS } from '@/lib/labels';

import { useExpense, useExpenseAction, useUploadReceipt } from './api';
import { ExpenseFormDialog } from './FinanceForms';

type Action = 'approve' | 'reject' | 'reimburse';

const ACTIONS: Record<Action, { title: string; description: string; label: string; reason?: string; required?: boolean; tone?: 'danger' }> = {
  approve: { title: 'Approve expense?', description: 'It will count against the budget. Approval is refused if the budget would be exceeded.', label: 'Approve', reason: 'Note' },
  reject: { title: 'Reject expense?', description: 'The filer is notified with your reason. Rejected expenses stay on record.', label: 'Reject', reason: 'Reason', required: true, tone: 'danger' },
  reimburse: { title: 'Record reimbursement?', description: 'Confirms the money was paid back. This is final.', label: 'Mark reimbursed', reason: 'Note (e.g. reference number)' },
};

export default function ExpenseDetailPage() {
  const { id = '' } = useParams();
  const { can, user } = useAuth();
  const toast = useToast();
  const query = useExpense(id);
  const action = useExpenseAction(id);
  const upload = useUploadReceipt(id);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [editing, setEditing] = useState(false);

  if (query.isLoading) return <LoadingBlock rows={8} />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const e = query.data;
  const isFiler = e.createdById === user?.id;
  const canReview = can('expenses:approve') && e.status === 'PENDING' && !isFiler;
  const manage = can('finance:manage');

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to={`/finance/budgets/${e.budget.id}`} className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft size={14} aria-hidden /> {e.budget.name}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {formatMoney(e.amount)} <StatusBadge value={e.status} map={EXPENSE_STATUS} />
          </span>
        }
        description={e.description}
        actions={
          <>
            {manage && e.status === 'PENDING' ? (
              <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
            {canReview ? (
              <>
                <Button variant="danger-ghost" icon={CircleX} onClick={() => setPending('reject')}>
                  Reject
                </Button>
                <Button icon={CircleCheck} onClick={() => setPending('approve')}>
                  Approve
                </Button>
              </>
            ) : null}
            {manage && e.status === 'APPROVED' ? (
              <Button icon={HandCoins} onClick={() => setPending('reimburse')}>
                Mark reimbursed
              </Button>
            ) : null}
          </>
        }
      />
      {can('expenses:approve') && e.status === 'PENDING' && isFiler ? (
        <p className="mb-4 rounded-lg bg-warning-soft px-4 py-2 text-sm text-warning">You filed this expense, so another officer must review it.</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Details" />
          <CardBody>
            <DetailList
              items={[
                { label: 'Amount', value: formatMoney(e.amount) },
                { label: 'Category', value: EXPENSE_CATEGORY_LABELS[e.category] },
                { label: 'Date', value: formatCalendarDate(e.expenseDate) },
                { label: 'Budget', value: <Link to={`/finance/budgets/${e.budget.id}`} className="text-primary hover:underline">{e.budget.name}</Link> },
                { label: 'Event', value: e.event ? <Link to={`/events/${e.event.id}`} className="text-primary hover:underline">{e.event.name}</Link> : '—' },
                { label: 'Paid by', value: e.paidBy?.name ?? 'Organization funds' },
                { label: 'Filed by', value: e.createdBy },
                { label: 'Reviewed by', value: e.reviewedBy ? `${e.reviewedBy} · ${formatDateTime(e.reviewedAt)}` : '—' },
                ...(e.reviewNote ? [{ label: 'Review note', value: e.reviewNote }] : []),
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Status history" description="Append-only record" />
          <ol className="space-y-4 p-5">
            {e.history.map((h) => (
              <li key={h.id} className="relative border-l-2 border-border pl-4">
                <span className="absolute top-1 -left-[5px] h-2 w-2 rounded-full bg-primary" aria-hidden />
                <p className="text-sm font-medium">{EXPENSE_STATUS[h.toStatus].label}</p>
                <p className="text-xs text-fg-subtle">
                  {h.changedBy} · {formatDateTime(h.createdAt)}
                </p>
                {h.note ? <p className="mt-1 text-sm text-fg-muted">“{h.note}”</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Receipts"
          description="JPG, PNG, WEBP or PDF up to 5 MB. Required before reimbursement."
          action={
            manage && (e.status === 'PENDING' || e.status === 'APPROVED') ? (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) upload.mutate(file, { onSuccess: () => toast.success('Receipt uploaded.'), onError: toast.error });
                  }}
                />
                <Button size="sm" variant="secondary" icon={Upload} loading={upload.isPending} onClick={() => fileInput.current?.click()}>
                  Upload receipt
                </Button>
              </>
            ) : null
          }
        />
        {e.receipts.length === 0 ? (
          <EmptyState title="No receipts uploaded" />
        ) : (
          <ul className="divide-y divide-border">
            {e.receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.originalName}</span>
                  <span className="text-xs text-fg-subtle">
                    {formatFileSize(r.sizeBytes)} · {r.uploadedBy} · {formatDateTime(r.uploadedAt)}
                  </span>
                </span>
                <Button size="sm" variant="ghost" icon={Eye} onClick={() => openFile(`/receipts/${r.id}/file`).catch(toast.error)}>
                  View
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing ? <ExpenseFormDialog expense={e} onClose={() => setEditing(false)} /> : null}
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending ? ACTIONS[pending].title : ''}
        description={pending ? ACTIONS[pending].description : undefined}
        confirmLabel={pending ? ACTIONS[pending].label : undefined}
        tone={pending ? ACTIONS[pending].tone : undefined}
        reasonLabel={pending ? ACTIONS[pending].reason : undefined}
        reasonRequired={pending ? ACTIONS[pending].required : false}
        loading={action.isPending}
        onConfirm={(note) =>
          pending &&
          action.mutate(
            { action: pending, note },
            {
              onSuccess: () => {
                toast.success(`Expense ${pending === 'approve' ? 'approved' : pending === 'reject' ? 'rejected' : 'marked reimbursed'}.`);
                setPending(null);
              },
              onError: (err) => {
                setPending(null);
                toast.error(err);
              },
            },
          )
        }
      />
    </>
  );
}
