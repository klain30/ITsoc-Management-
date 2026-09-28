import { Download, MonitorPlay, Pencil, QrCode, Square } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge, EmptyState, ErrorState, LoadingBlock, StatusBadge } from '@/components/ui/Display';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, Textarea } from '@/components/ui/Form';
import { Table, Td, Th, THead, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { downloadFile } from '@/lib/files';
import { formatDateTime, formatPercent, formatTime } from '@/lib/format';
import { ATTENDANCE_STATUS, enumOptions } from '@/lib/labels';
import type { AttendanceRecord, AttendanceStatus, EventItem } from '@/types/api';

import { useAttendanceSessions, useCloseSession, useEventAttendance, useOpenSession, useSetAttendance } from './api';

export function AttendancePanel({ event }: { event: EventItem }) {
  const { can } = useAuth();
  const canManage = can('attendance:manage');
  const attendance = useEventAttendance(event.id, true);
  const sessions = useAttendanceSessions(event.id, true);
  const openSession = useOpenSession(event.id);
  const closeSession = useCloseSession(event.id);
  const toast = useToast();
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);

  const canOpen = canManage && (event.status === 'PUBLISHED' || event.status === 'ONGOING');
  const openNow = sessions.data?.find((s) => s.isOpen);

  if (attendance.isLoading) return <LoadingBlock />;
  if (attendance.isError || !attendance.data) return <ErrorState error={attendance.error} onRetry={() => attendance.refetch()} />;
  const { stats, records } = attendance.data;

  return (
    <div>
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-5">
        {[
          { label: 'Registered', value: stats.registered },
          { label: 'Present', value: stats.present },
          { label: 'Late', value: stats.late },
          { label: 'Absent', value: stats.absent },
          { label: 'Attendance rate', value: formatPercent(stats.attendanceRate) },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface px-4 py-3">
            <p className="text-xs text-fg-subtle">{stat.label}</p>
            <p className="mt-0.5 text-lg font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Check-in sessions */}
      <div className="border-b border-border px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">QR check-in</h3>
            <p className="text-xs text-fg-subtle">
              {openNow
                ? `Open until ${formatTime(openNow.closesAt)} · ${openNow.checkIns} checked in · late after ${formatTime(openNow.lateAfter)}`
                : 'Open a session to display a rotating QR code members scan to check in.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {openNow && canManage ? (
              <>
                <ButtonLink to={`/attendance/${openNow.id}/display`} icon={MonitorPlay} target="_blank">
                  Show QR code
                </ButtonLink>
                <Button
                  variant="secondary"
                  icon={Square}
                  loading={closeSession.isPending}
                  onClick={() => closeSession.mutate(openNow.id, { onSuccess: () => toast.success('Check-in closed.'), onError: toast.error })}
                >
                  Close check-in
                </Button>
              </>
            ) : canOpen ? (
              <Button
                icon={QrCode}
                loading={openSession.isPending}
                onClick={() =>
                  openSession.mutate(
                    {},
                    {
                      onSuccess: () => toast.success(event.status === 'PUBLISHED' ? 'Check-in opened and the event is now ongoing.' : 'Check-in opened.'),
                      onError: toast.error,
                    },
                  )
                }
              >
                Open check-in
              </Button>
            ) : null}
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => downloadFile(`/events/${event.id}/attendance.csv`, 'attendance.csv').catch(toast.error)}
            >
              Export CSV
            </Button>
          </div>
        </div>
        {sessions.data && sessions.data.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2 text-xs text-fg-muted">
            {sessions.data.map((s) => (
              <li key={s.id} className="rounded-md bg-muted px-2 py-1">
                {s.name} · {formatDateTime(s.opensAt)} · {s.checkIns} check-ins {s.isOpen ? <Badge tone="success">Open</Badge> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {records.length === 0 ? (
        <EmptyState title="No attendance recorded yet" description="Records appear here as members check in." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Member</Th>
              <Th>Status</Th>
              <Th>Checked in</Th>
              <Th>Source</Th>
              <Th>Note</Th>
              {canManage ? <Th className="text-right">Actions</Th> : null}
            </tr>
          </THead>
          <tbody>
            {records.map((record) => (
              <Tr key={record.id}>
                <Td>
                  {can('members:read') ? (
                    <Link to={`/members/${record.member.id}`} className="font-medium hover:underline">
                      {record.member.fullName}
                    </Link>
                  ) : (
                    <span className="font-medium">{record.member.fullName}</span>
                  )}
                  <span className="block text-xs text-fg-subtle tabular">{record.member.studentId}</span>
                </Td>
                <Td>
                  <StatusBadge value={record.status} map={ATTENDANCE_STATUS} />
                </Td>
                <Td className="whitespace-nowrap text-fg-muted">{record.checkedInAt ? formatTime(record.checkedInAt) : '—'}</Td>
                <Td className="text-fg-muted">
                  {record.source === 'QR' ? 'QR scan' : record.source === 'MANUAL' ? `Manual${record.recordedBy ? ` · ${record.recordedBy}` : ''}` : 'Auto (no-show)'}
                </Td>
                <Td className="max-w-56 truncate text-fg-muted" title={record.note ?? undefined}>
                  {record.note ?? '—'}
                </Td>
                {canManage ? (
                  <Td className="text-right">
                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(record)}>
                      Correct
                    </Button>
                  </Td>
                ) : null}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {editing ? <CorrectAttendanceDialog eventId={event.id} record={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function CorrectAttendanceDialog({ eventId, record, onClose }: { eventId: string; record: AttendanceRecord; onClose: () => void }) {
  const [status, setStatus] = useState<AttendanceStatus>(record.status);
  const [note, setNote] = useState('');
  const mutation = useSetAttendance(eventId);
  const toast = useToast();
  const valid = note.trim().length >= 3 && status !== record.status;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Correct attendance — ${record.member.fullName}`}
      description="Manual changes are recorded in the audit log with your name and reason."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            loading={mutation.isPending}
            onClick={() =>
              mutation.mutate(
                { memberId: record.member.id, status, note: note.trim() },
                {
                  onSuccess: () => {
                    toast.success('Attendance updated.');
                    onClose();
                  },
                  onError: toast.error,
                },
              )
            }
          >
            Save correction
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Status">
          {(f) => (
            <Select {...f} value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)}>
              {enumOptions(ATTENDANCE_STATUS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reason" required hint="e.g. “Phone battery died; verified by student ID at the desk.”">
          {(f) => <Textarea {...f} rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
