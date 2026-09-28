import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { Fragment, useState } from 'react';

import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { Input, Select } from '@/components/ui/Form';
import { Pagination, Table, Td, Th, THead, Toolbar, Tr } from '@/components/ui/Table';
import { getData, getPage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABELS, humanizeAction } from '@/lib/labels';
import type { AuditLogEntry, Paginated } from '@/types/api';

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const actions = useQuery({ queryKey: ['audit', 'actions'], queryFn: () => getData<string[]>('/audit-logs/actions'), staleTime: Infinity });
  const query = useQuery({
    queryKey: ['audit', page, action, from, to],
    queryFn: () =>
      getPage<Paginated<AuditLogEntry>>('/audit-logs', {
        params: {
          page,
          pageSize: 25,
          action: action || undefined,
          from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        },
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Audit log" description="Every significant action, who did it and when. Entries cannot be edited or deleted." />
      <Card>
        <Toolbar>
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="w-auto"
            aria-label="Action"
          >
            <option value="">All actions</option>
            {actions.data?.map((a) => (
              <option key={a} value={a}>
                {humanizeAction(a)}
              </option>
            ))}
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" aria-label="From" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" aria-label="To" />
        </Toolbar>
        {query.isLoading ? (
          <LoadingBlock rows={10} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data && query.data.data.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>Action</Th>
                  <Th>Record</Th>
                  <Th>IP</Th>
                </tr>
              </THead>
              <tbody>
                {query.data.data.map((log) => (
                  <Fragment key={log.id}>
                    <Tr onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                      <Td className="whitespace-nowrap text-fg-muted">{formatDateTime(log.createdAt)}</Td>
                      <Td>
                        {log.actor ? (
                          <>
                            <span className="font-medium">{log.actor.name}</span>
                            <span className="block text-xs text-fg-subtle">{ROLE_LABELS[log.actor.role]}</span>
                          </>
                        ) : (
                          <span className="text-fg-subtle">System / anonymous</span>
                        )}
                      </Td>
                      <Td>{humanizeAction(log.action)}</Td>
                      <Td className="text-fg-muted">
                        {log.entityType}
                        {log.entityId ? <span className="block font-mono text-xs text-fg-subtle">{log.entityId}</span> : null}
                      </Td>
                      <Td className="font-mono text-xs text-fg-subtle">{log.ipAddress ?? '—'}</Td>
                    </Tr>
                    {expanded === log.id && log.metadata ? (
                      <tr className="border-b border-border bg-muted/50">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="overflow-x-auto text-xs whitespace-pre-wrap text-fg-muted">{JSON.stringify(log.metadata, null, 2)}</pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </Table>
            <Pagination meta={query.data.meta} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState icon={ScrollText} title="No entries match these filters" />
        )}
      </Card>
    </>
  );
}
