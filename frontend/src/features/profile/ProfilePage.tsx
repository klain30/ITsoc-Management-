import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Save } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Avatar, Card, CardBody, CardHeader, DetailList, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui/Display';
import { Field, FormError, Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { newPasswordSchema, PASSWORD_HINT } from '@/features/auth/passwordSchema';
import { useAuth } from '@/features/auth/useAuth';
import { ApiError, getData, patchData, postData } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ATTENDANCE_STATUS, MEMBERSHIP_STATUS, ROLE_LABELS, yearLabel } from '@/lib/labels';
import type { AuthPayload, MemberDetail, MyAttendance } from '@/types/api';

export default function ProfilePage() {
  const query = useQuery({ queryKey: ['profile'], queryFn: () => getData<MemberDetail>('/profile') });
  if (query.isLoading) return <LoadingBlock rows={8} />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const me = query.data;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={me.fullName} /> {me.fullName}
          </span>
        }
        description={`${me.position?.name ?? (me.account ? ROLE_LABELS[me.account.role] : 'Member')} · ${me.email}`}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="My information" description="Ask an officer to correct your name, student ID, email or course." />
          <CardBody className="space-y-6">
            <DetailList
              items={[
                { label: 'Student ID', value: me.studentId },
                { label: 'Course', value: `${me.course} · ${yearLabel(me.yearLevel)}` },
                { label: 'Membership', value: <StatusBadge value={me.status} map={MEMBERSHIP_STATUS} /> },
                { label: 'Member since', value: formatDate(me.dateJoined) },
              ]}
            />
            <ContactForm key={me.updatedAt} me={me} />
          </CardBody>
        </Card>
        <ChangePasswordCard />
      </div>
      <MyAttendanceCard />
    </>
  );
}

function ContactForm({ me }: { me: MemberDetail }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [contactNumber, setContact] = useState(me.contactNumber ?? '');
  const [section, setSection] = useState(me.section ?? '');
  const [middleName, setMiddle] = useState(me.middleName ?? '');
  const save = useMutation({
    mutationFn: () => patchData('/profile', { contactNumber: contactNumber || null, section: section || null, middleName: middleName || null }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile updated.');
    },
  });
  const err = (f: string) => (save.error instanceof ApiError ? save.error.fieldErrors[f]?.[0] : undefined);

  return (
    <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
      <Field label="Middle name" error={err('middleName')}>
        {(f) => <Input {...f} value={middleName} onChange={(e) => setMiddle(e.target.value)} />}
      </Field>
      <Field label="Section" error={err('section')}>
        {(f) => <Input {...f} value={section} onChange={(e) => setSection(e.target.value)} />}
      </Field>
      <Field label="Contact number" error={err('contactNumber')}>
        {(f) => <Input {...f} type="tel" value={contactNumber} onChange={(e) => setContact(e.target.value)} placeholder="09171234567" />}
      </Field>
      <div className="sm:col-span-3">
        <Button icon={Save} loading={save.isPending} onClick={() => save.mutate()}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const { acceptSession } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const policy = newPasswordSchema.safeParse(next);
  const change = useMutation({
    mutationFn: () => postData<AuthPayload>('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: (payload) => {
      if (payload) acceptSession(payload);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password changed. Other devices have been signed out.');
    },
  });

  return (
    <Card>
      <CardHeader title="Change password" />
      <CardBody className="space-y-4">
        <FormError message={change.error instanceof ApiError ? change.error.message : null} />
        <Field label="Current password">
          {(f) => <Input {...f} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
        </Field>
        <Field label="New password" hint={PASSWORD_HINT} error={next && !policy.success ? policy.error.issues[0]?.message : undefined}>
          {(f) => <Input {...f} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <Field label="Confirm new password" error={confirm && confirm !== next ? 'Passwords do not match.' : undefined}>
          {(f) => <Input {...f} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <Button icon={KeyRound} className="w-full" disabled={!current || !policy.success || confirm !== next} loading={change.isPending} onClick={() => change.mutate()}>
          Update password
        </Button>
      </CardBody>
    </Card>
  );
}

function MyAttendanceCard() {
  const query = useQuery({ queryKey: ['attendance', 'me'], queryFn: () => getData<MyAttendance[]>('/attendance/me') });
  return (
    <Card className="mt-6">
      <CardHeader title="My attendance history" />
      {query.isLoading ? (
        <LoadingBlock />
      ) : !query.data?.length ? (
        <EmptyState title="No attendance records yet" />
      ) : (
        <ul className="divide-y divide-border">
          {query.data.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span>
                <Link to={`/events/${a.event.id}`} className="font-medium hover:underline">
                  {a.event.name}
                </Link>
                <span className="block text-xs text-fg-subtle">
                  {formatDate(a.event.startsAt)} · {a.event.location}
                </span>
              </span>
              <StatusBadge value={a.status} map={ATTENDANCE_STATUS} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
