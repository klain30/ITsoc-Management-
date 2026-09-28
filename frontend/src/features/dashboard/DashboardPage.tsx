import { useQuery } from '@tanstack/react-query';
import { Award, CalendarDays, ChartColumn, Hourglass, MapPin, Pin, UserCheck, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ButtonLink } from '@/components/ui/Button';
import { BarList, Meter, StatTile } from '@/components/ui/Charts';
import { Badge, Card, CardBody, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui/Display';
import { useCurrentUser } from '@/features/auth/useAuth';
import { getData } from '@/lib/api';
import { formatDate, formatEventRange, formatMoney, formatNumber, formatPercent, formatRelative } from '@/lib/format';
import { ATTENDANCE_STATUS, EVENT_STATUS, EXPENSE_CATEGORY_LABELS, ROLE_LABELS, humanizeAction } from '@/lib/labels';
import type { Dashboard } from '@/types/api';

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

export default function DashboardPage() {
  const user = useCurrentUser();
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => getData<Dashboard>('/dashboard') });

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.firstName}`}
        description={
          <span className="inline-flex items-center gap-2">
            {user.position ?? ROLE_LABELS[user.role]}
            {user.position && user.role !== 'MEMBER' && user.position !== ROLE_LABELS[user.role] ? <Badge tone="primary">{ROLE_LABELS[user.role]}</Badge> : null}
          </span>
        }
      />
      {query.isLoading ? (
        <LoadingBlock rows={10} />
      ) : query.isError || !query.data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <DashboardContent data={query.data} />
      )}
    </>
  );
}

function DashboardContent({ data }: { data: Dashboard }) {
  const { me, organization, finance, recentActivity } = data;
  const isOfficer = Boolean(organization || finance || recentActivity);

  return (
    <div className="space-y-6">
      {/* KPI row: officers see organization numbers, members see their own. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {organization ? (
          <>
            <StatTile label="Active members" value={formatNumber(organization.members.active)} icon={Users} hint={`${organization.members.pendingInvites} invites pending`} />
            <StatTile
              label="Upcoming events"
              value={organization.events.published + organization.events.ongoing}
              icon={CalendarDays}
              hint={`${organization.events.draft} drafts · ${organization.events.completed} completed`}
            />
            <StatTile label="Average attendance" value={formatPercent(organization.averageAttendanceRate)} icon={UserCheck} hint="Last 6 completed events" />
          </>
        ) : null}
        {finance ? (
          <>
            <StatTile label="Remaining funds" value={formatMoney(finance.remaining)} icon={Wallet} hint={`${formatMoney(finance.totalSpent)} spent of ${formatMoney(finance.totalAllocated)}`} />
            {!organization ? (
              <>
                <StatTile label="Total allocated" value={formatMoney(finance.totalAllocated)} icon={ChartColumn} />
                <StatTile label="Pending expenses" value={finance.counts.pending} icon={Hourglass} hint={`${formatMoney(finance.totalPending)} awaiting review`} />
                <StatTile label="Approved / reimbursed" value={`${finance.counts.approved} / ${finance.counts.reimbursed}`} icon={Award} />
              </>
            ) : null}
          </>
        ) : null}
        {!isOfficer ? (
          <>
            <StatTile label="My registrations" value={me.upcomingEvents.length} icon={CalendarDays} hint="Upcoming" />
            <StatTile label="Events attended" value={me.attendance.present + me.attendance.late} icon={UserCheck} />
            <StatTile label="Attendance rate" value={formatPercent(me.attendance.rate)} icon={ChartColumn} />
            <StatTile label="Certificates" value={me.certificates.count} icon={Award} />
          </>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {organization ? (
          <Card>
            <CardHeader title="Upcoming events" action={<ButtonLink to="/events" size="sm" variant="ghost">View all</ButtonLink>} />
            {organization.upcomingEvents.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Nothing scheduled" />
            ) : (
              <ul className="divide-y divide-border">
                {organization.upcomingEvents.map((e) => (
                  <li key={e.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <Link to={`/events/${e.id}`} className="truncate font-medium hover:underline">
                        {e.name}
                      </Link>
                      <StatusBadge value={e.status} map={EVENT_STATUS} />
                    </div>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {formatDate(e.startsAt)} · {e.registeredCount}/{e.capacity} registered
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {organization ? (
          <Card>
            <CardHeader title="Attendance at recent events" description="Present + late, as a share of registrations" />
            <CardBody>
              <BarList
                max={100}
                data={organization.recentEvents.map((e) => ({ key: e.id, label: e.name, value: e.rate, display: `${formatPercent(e.rate)} · ${e.present + e.late}/${e.registered}` }))}
                emptyLabel="No completed events yet"
              />
            </CardBody>
          </Card>
        ) : null}

        {finance ? (
          <Card>
            <CardHeader title="Budget" action={<ButtonLink to="/finance" size="sm" variant="ghost">Open finance</ButtonLink>} />
            <CardBody className="space-y-5">
              <div>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-fg-muted">Utilization of active budgets</span>
                  <span className="font-medium tabular">{formatPercent(finance.utilization)}</span>
                </div>
                <Meter value={finance.utilization} label="Budget utilization" />
              </div>
              <BarList
                data={finance.byCategory.slice(0, 5).map((c) => ({
                  key: c.category,
                  label: EXPENSE_CATEGORY_LABELS[c.category],
                  value: Number(c.amount),
                  display: formatMoney(c.amount),
                }))}
                emptyLabel="No approved expenses yet"
              />
              {finance.counts.pending > 0 ? (
                <Link to="/finance" className="block rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning hover:underline">
                  {finance.counts.pending} expenses ({formatMoney(finance.totalPending)}) are waiting for review
                </Link>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="My upcoming events" action={<ButtonLink to="/events" size="sm" variant="ghost">Browse events</ButtonLink>} />
          {me.upcomingEvents.length === 0 ? (
            <EmptyState icon={CalendarDays} title="You haven’t registered for anything upcoming" />
          ) : (
            <ul className="divide-y divide-border">
              {me.upcomingEvents.map((e) => (
                <li key={e.id} className="px-5 py-3">
                  <Link to={`/events/${e.id}`} className="font-medium hover:underline">
                    {e.name}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-subtle">
                    <span>{formatEventRange(e.startsAt, e.endsAt)}</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} aria-hidden /> {e.location}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
          {me.openEvents.length > 0 ? (
            <div className="border-t border-border px-5 py-3">
              <p className="mb-2 text-xs font-medium text-fg-subtle">Open for registration</p>
              <ul className="space-y-1.5">
                {me.openEvents.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3 text-sm">
                    <Link to={`/events/${e.id}`} className="truncate text-primary hover:underline">
                      {e.name}
                    </Link>
                    <span className="shrink-0 text-xs text-fg-subtle">{e.spotsLeft} spots left</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Announcements" action={<ButtonLink to="/announcements" size="sm" variant="ghost">View all</ButtonLink>} />
          {me.announcements.length === 0 ? (
            <EmptyState title="No announcements" />
          ) : (
            <ul className="divide-y divide-border">
              {me.announcements.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <p className="flex items-center gap-2 font-medium">
                    {a.isPinned ? <Pin size={14} className="text-primary" aria-label="Pinned" /> : null}
                    {a.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{a.content}</p>
                  {a.publishedAt ? <p className="mt-1 text-xs text-fg-subtle">{formatRelative(a.publishedAt)}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {!isOfficer ? (
          <Card>
            <CardHeader title="My attendance" />
            {me.recentAttendance.length === 0 ? (
              <EmptyState title="No attendance yet" description="Check in at events by scanning the QR code on screen." />
            ) : (
              <ul className="divide-y divide-border">
                {me.recentAttendance.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span>
                      <Link to={`/events/${a.event.id}`} className="font-medium hover:underline">
                        {a.event.name}
                      </Link>
                      <span className="block text-xs text-fg-subtle">{formatDate(a.event.startsAt)}</span>
                    </span>
                    <StatusBadge value={a.status} map={ATTENDANCE_STATUS} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        {recentActivity ? (
          <Card>
            <CardHeader title="Recent activity" action={<ButtonLink to="/audit-log" size="sm" variant="ghost">Audit log</ButtonLink>} />
            <ul className="divide-y divide-border">
              {recentActivity.map((log) => (
                <li key={log.id} className="flex justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{log.actor?.name ?? 'System'}</span> <span className="text-fg-muted">— {humanizeAction(log.action)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-fg-subtle">{formatRelative(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
