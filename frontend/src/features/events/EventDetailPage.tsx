import {
  ArrowLeft,
  Ban,
  CalendarCheck,
  CalendarClock,
  CircleCheck,
  Clock,
  Download,
  MapPin,
  Pencil,
  Play,
  Send,
  Undo2,
  User,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Badge, Card, CardBody, CardHeader, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui/Display';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { EventCertificatesPanel } from '@/features/certificates/EventCertificatesPanel';
import { downloadFile } from '@/lib/files';
import { formatDateTime, formatEventRange } from '@/lib/format';
import { ATTENDANCE_STATUS, EVENT_STATUS } from '@/lib/labels';
import type { EventItem, EventStatus } from '@/types/api';

import { useCancelRegistration, useChangeEventStatus, useEvent, useRegister } from './api';
import { AttendancePanel } from './AttendancePanel';
import { EventFormDialog } from './EventFormDialog';
import { RegistrationsPanel } from './RegistrationsPanel';

type Transition = { to: EventStatus; label: string; icon: typeof Send; confirm?: string; tone?: 'danger' };

const TRANSITIONS: Partial<Record<EventStatus, Transition[]>> = {
  DRAFT: [
    { to: 'PUBLISHED', label: 'Publish', icon: Send, confirm: 'Members will be able to see and register for this event.' },
    { to: 'CANCELLED', label: 'Cancel event', icon: Ban, confirm: 'This cannot be undone.', tone: 'danger' },
  ],
  PUBLISHED: [
    { to: 'ONGOING', label: 'Start event', icon: Play },
    { to: 'DRAFT', label: 'Unpublish', icon: Undo2, confirm: 'Only possible while nobody has registered.' },
    { to: 'CANCELLED', label: 'Cancel event', icon: Ban, confirm: 'Registered members will be notified. This cannot be undone.', tone: 'danger' },
  ],
  ONGOING: [
    {
      to: 'COMPLETED',
      label: 'Mark completed',
      icon: CircleCheck,
      confirm: 'Open check-in sessions will close and registered members who did not check in will be marked absent.',
    },
  ],
};

export default function EventDetailPage() {
  const { id = '' } = useParams();
  const { can, canAny } = useAuth();
  const query = useEvent(id);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Transition | null>(null);
  const changeStatus = useChangeEventStatus(id);
  const toast = useToast();

  const showRegistrations = canAny('events:manage', 'attendance:read');
  const showAttendance = can('attendance:read');
  const tabs = [
    ...(showRegistrations ? [{ key: 'registrations' as const, label: 'Registrations' }] : []),
    ...(showAttendance ? [{ key: 'attendance' as const, label: 'Attendance' }] : []),
    ...(can('certificates:issue') ? [{ key: 'certificates' as const, label: 'Certificates' }] : []),
  ];
  const [tab, setTab] = useState<(typeof tabs)[number]['key'] | null>(null);
  const activeTab = tab ?? tabs[0]?.key ?? null;

  if (query.isLoading) return <LoadingBlock rows={8} />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const event = query.data;
  const transitions = can('events:manage') ? (TRANSITIONS[event.status] ?? []) : [];

  const runTransition = async (transition: Transition) => {
    try {
      await changeStatus.mutateAsync(transition.to);
      toast.success(`Event ${EVENT_STATUS[transition.to].label.toLowerCase()}.`);
      setPending(null);
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/events" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft size={14} aria-hidden /> Events
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {event.name}
            <StatusBadge value={event.status} map={EVENT_STATUS} />
          </span>
        }
        actions={
          <>
            {can('events:manage') && (event.status === 'DRAFT' || event.status === 'PUBLISHED') ? (
              <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
            {transitions.map((t) => (
              <Button
                key={t.to}
                variant={t.tone === 'danger' ? 'danger-ghost' : t.to === 'DRAFT' ? 'secondary' : 'primary'}
                icon={t.icon}
                loading={changeStatus.isPending && changeStatus.variables === t.to}
                onClick={() => (t.confirm ? setPending(t) : void runTransition(t))}
              >
                {t.label}
              </Button>
            ))}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Details" />
          <CardBody className="space-y-5">
            <ul className="grid gap-3 text-sm sm:grid-cols-2">
              <InfoRow icon={Clock} label="When" value={formatEventRange(event.startsAt, event.endsAt)} />
              <InfoRow icon={MapPin} label="Where" value={event.location} />
              <InfoRow icon={Users} label="Capacity" value={`${event.registeredCount} registered of ${event.capacity}`} />
              <InfoRow icon={CalendarClock} label="Registration closes" value={formatDateTime(event.registrationDeadline)} />
              <InfoRow icon={User} label="Organized by" value={event.createdBy} />
            </ul>
            {event.description ? (
              <div>
                <h3 className="mb-1 text-xs font-medium text-fg-subtle">About this event</h3>
                <p className="text-sm leading-relaxed whitespace-pre-line text-fg">{event.description}</p>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <MyParticipationCard event={event} />
      </div>

      {tabs.length > 0 && activeTab ? (
        <Card className="mt-6">
          <Tabs className="px-4" items={tabs} value={activeTab} onChange={setTab} />
          {activeTab === 'registrations' ? <RegistrationsPanel eventId={event.id} /> : null}
          {activeTab === 'attendance' ? <AttendancePanel event={event} /> : null}
          {activeTab === 'certificates' ? <EventCertificatesPanel event={event} /> : null}
        </Card>
      ) : null}

      {editing ? <EventFormDialog open onClose={() => setEditing(false)} event={event} /> : null}
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && void runTransition(pending)}
        title={pending ? `${pending.label}?` : ''}
        description={pending?.confirm}
        confirmLabel={pending?.label}
        tone={pending?.tone}
        loading={changeStatus.isPending}
      />
    </>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-fg-muted">
        <Icon size={16} aria-hidden />
      </span>
      <span>
        <span className="block text-xs text-fg-subtle">{label}</span>
        <span className="text-fg">{value}</span>
      </span>
    </li>
  );
}

/** The signed-in member's own status for this event: register, cancel, attendance, certificate. */
function MyParticipationCard({ event }: { event: EventItem }) {
  const toast = useToast();
  const register = useRegister(event.id);
  const cancel = useCancelRegistration(event.id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const canCancel = event.myRegistration && event.status === 'PUBLISHED' && new Date(event.registrationDeadline) > new Date();

  let body;
  if (event.myAttendance) {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-fg-muted">Your attendance</p>
        <StatusBadge value={event.myAttendance.status} map={ATTENDANCE_STATUS} />
        {event.myAttendance.checkedInAt ? <p className="text-xs text-fg-subtle">Checked in {formatDateTime(event.myAttendance.checkedInAt)}</p> : null}
      </div>
    );
  } else if (event.myRegistration) {
    body = (
      <div className="space-y-2">
        <Badge tone="primary" dot>
          You’re registered
        </Badge>
        <p className="text-sm text-fg-muted">
          {event.status === 'ONGOING'
            ? 'Scan the QR code shown at the venue to check in.'
            : 'On the day, scan the QR code shown at the venue to record your attendance.'}
        </p>
      </div>
    );
  } else if (event.isRegistrationOpen) {
    body = <p className="text-sm text-fg-muted">{event.spotsLeft} spots left. Registration closes {formatDateTime(event.registrationDeadline)}.</p>;
  } else {
    body = (
      <p className="text-sm text-fg-muted">
        {event.status === 'CANCELLED'
          ? 'This event was cancelled.'
          : event.status === 'COMPLETED'
            ? 'This event has ended.'
            : event.status === 'DRAFT'
              ? 'This is a draft; members cannot see it yet.'
              : 'Registration is closed.'}
      </p>
    );
  }

  return (
    <Card>
      <CardHeader title="Your participation" />
      <CardBody className="space-y-4">
        {body}
        {!event.myRegistration && event.isRegistrationOpen ? (
          <Button
            icon={CalendarCheck}
            className="w-full"
            loading={register.isPending}
            onClick={() =>
              register.mutate(undefined, {
                onSuccess: () => toast.success('You’re registered! A confirmation was added to your notifications.'),
                onError: (e) => toast.error(e),
              })
            }
          >
            Register
          </Button>
        ) : null}
        {canCancel && !event.myAttendance ? (
          <Button variant="secondary" className="w-full" onClick={() => setConfirmCancel(true)}>
            Cancel registration
          </Button>
        ) : null}
        {event.myCertificate ? (
          <Button
            variant="secondary"
            icon={Download}
            className="w-full"
            onClick={() =>
              downloadFile(`/certificates/${event.myCertificate!.id}/download`, `certificate-${event.myCertificate!.code}.pdf`).catch(toast.error)
            }
          >
            Download certificate
          </Button>
        ) : null}
      </CardBody>
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel your registration?"
        description="Your spot will be released to other members. You can register again before the deadline."
        confirmLabel="Cancel registration"
        tone="danger"
        loading={cancel.isPending}
        onConfirm={() =>
          cancel.mutate(undefined, {
            onSuccess: () => {
              setConfirmCancel(false);
              toast.success('Registration cancelled.');
            },
            onError: (e) => toast.error(e),
          })
        }
      />
    </Card>
  );
}
