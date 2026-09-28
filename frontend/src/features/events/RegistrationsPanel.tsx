import { Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge, EmptyState, ErrorState, LoadingBlock, StatusBadge } from '@/components/ui/Display';
import { Table, Td, Th, THead, Tr } from '@/components/ui/Table';
import { useAuth } from '@/features/auth/useAuth';
import { formatDateTime, yearLabelShort } from '@/lib/format';
import { ATTENDANCE_STATUS } from '@/lib/labels';

import { useRegistrations } from './api';

export function RegistrationsPanel({ eventId }: { eventId: string }) {
  const { can } = useAuth();
  const query = useRegistrations(eventId, true);

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const rows = query.data ?? [];
  if (rows.length === 0) return <EmptyState icon={Users} title="No registrations yet" />;

  const active = rows.filter((r) => r.status === 'REGISTERED').length;

  return (
    <>
      <p className="px-4 pt-3 text-sm text-fg-muted">
        {active} registered{rows.length > active ? ` · ${rows.length - active} cancelled` : ''}
      </p>
      <Table>
        <THead>
          <tr>
            <Th>Member</Th>
            <Th>Student ID</Th>
            <Th>Course</Th>
            <Th>Registered</Th>
            <Th>Attendance</Th>
          </tr>
        </THead>
        <tbody>
          {rows.map((row) => (
            <Tr key={row.id} className={row.status === 'CANCELLED' ? 'opacity-60' : undefined}>
              <Td className="font-medium">
                {can('members:read') ? (
                  <Link to={`/members/${row.member.id}`} className="hover:underline">
                    {row.member.fullName}
                  </Link>
                ) : (
                  row.member.fullName
                )}
                {row.status === 'CANCELLED' ? (
                  <Badge className="ml-2" tone="neutral">
                    Cancelled
                  </Badge>
                ) : null}
              </Td>
              <Td className="text-fg-muted tabular">{row.member.studentId}</Td>
              <Td className="text-fg-muted">
                {row.member.course} · {yearLabelShort(row.member.yearLevel)}
              </Td>
              <Td className="whitespace-nowrap text-fg-muted">{formatDateTime(row.registeredAt)}</Td>
              <Td>{row.attendance ? <StatusBadge value={row.attendance.status} map={ATTENDANCE_STATUS} /> : <span className="text-fg-subtle">—</span>}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
