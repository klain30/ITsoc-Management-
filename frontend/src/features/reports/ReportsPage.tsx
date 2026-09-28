import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { BarList, ColumnChart, StatTile } from '@/components/ui/Charts';
import { Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { Input } from '@/components/ui/Form';
import { Table, Td, Th, THead, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { getData } from '@/lib/api';
import { downloadFile } from '@/lib/files';
import { formatDate, formatPercent } from '@/lib/format';
import { MEMBERSHIP_STATUS, yearLabel } from '@/lib/labels';
import type { AttendanceReport, MembershipReport } from '@/types/api';

export default function ReportsPage() {
  const { canAny, can } = useAuth();
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="Reports"
        description="Attendance, membership and financial reports, exportable as CSV."
        actions={
          can('finance:read') ? (
            <Button variant="secondary" icon={Download} onClick={() => downloadFile('/expenses/export.csv', 'expenses.csv').catch(toast.error)}>
              Financial report (CSV)
            </Button>
          ) : null
        }
      />
      <div className="space-y-6">
        {canAny('reports:read', 'attendance:read') ? <AttendanceSection /> : null}
        {can('reports:read') ? <MembershipSection /> : null}
        {can('finance:read') && !canAny('reports:read', 'attendance:read') ? (
          <Card>
            <EmptyState title="Financial reports" description={<>See the <Link to="/finance" className="text-primary hover:underline">Finance</Link> page for budgets and spending, or export all expenses above.</>} />
          </Card>
        ) : null}
      </div>
    </>
  );
}

function AttendanceSection() {
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const params = { from: from || undefined, to: to ? `${to}T23:59:59` : undefined };
  const query = useQuery({ queryKey: ['reports', 'attendance', from, to], queryFn: () => getData<AttendanceReport>('/reports/attendance', { params }) });
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <Card>
      <CardHeader
        title="Attendance by event"
        description="Completed events"
        action={
          <>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" aria-label="From" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" aria-label="To" />
            <Button size="sm" variant="secondary" icon={Download} onClick={() => downloadFile(`/reports/attendance.csv${qs ? `?${qs}` : ''}`, 'attendance-report.csv').catch(toast.error)}>
              CSV
            </Button>
          </>
        }
      />
      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError || !query.data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.events.length === 0 ? (
        <EmptyState title="No completed events in this range" />
      ) : (
        <>
          <div className="grid gap-4 p-5 sm:grid-cols-4">
            <StatTile label="Events" value={query.data.totals.events} />
            <StatTile label="Registrations" value={query.data.totals.registered} />
            <StatTile label="Attended" value={query.data.totals.present + query.data.totals.late} hint={`${query.data.totals.late} late`} />
            <StatTile label="Attendance rate" value={formatPercent(query.data.totals.rate)} />
          </div>
          <Table>
            <THead>
              <tr>
                <Th>Event</Th>
                <Th>Date</Th>
                <Th className="text-right">Registered</Th>
                <Th className="text-right">Present</Th>
                <Th className="text-right">Late</Th>
                <Th className="text-right">Absent</Th>
                <Th className="text-right">Rate</Th>
              </tr>
            </THead>
            <tbody>
              {query.data.events.map((e) => (
                <Tr key={e.id}>
                  <Td>
                    <Link to={`/events/${e.id}`} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                  </Td>
                  <Td className="text-fg-muted">{formatDate(e.startsAt)}</Td>
                  <Td className="text-right tabular">{e.registered}</Td>
                  <Td className="text-right tabular">{e.present}</Td>
                  <Td className="text-right tabular">{e.late}</Td>
                  <Td className="text-right tabular">{e.absent}</Td>
                  <Td className="text-right font-medium tabular">{formatPercent(e.rate)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </Card>
  );
}

function MembershipSection() {
  const query = useQuery({ queryKey: ['reports', 'membership'], queryFn: () => getData<MembershipReport>('/reports/membership') });
  if (query.isLoading) return <LoadingBlock />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const d = query.data;
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-PH', { month: 'short', timeZone: 'UTC' });
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader title="Members by status" />
        <CardBody>
          <BarList data={d.byStatus.map((s) => ({ key: s.status, label: MEMBERSHIP_STATUS[s.status].label, value: s.count, display: String(s.count) }))} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Active members by course" />
        <CardBody>
          <BarList data={d.byCourse.map((c) => ({ key: c.course, label: c.course, value: c.count, display: String(c.count) }))} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Active members by year level" />
        <CardBody>
          <BarList data={d.byYearLevel.map((y) => ({ key: String(y.yearLevel), label: yearLabel(y.yearLevel), value: y.count, display: String(y.count) }))} />
        </CardBody>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader title="New members per month" description="Last 12 months" />
        <CardBody>
          <ColumnChart data={d.joinedByMonth.map((m) => ({ key: m.month, label: monthLabel(m.month), value: m.count, display: String(m.count) }))} />
        </CardBody>
      </Card>
    </div>
  );
}
