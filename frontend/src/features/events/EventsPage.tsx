import { CalendarDays, CalendarPlus, MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui/Display';
import { Select } from '@/components/ui/Form';
import { Pagination, SearchInput, Toolbar } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { Can } from '@/features/auth/guards';
import { useAuth } from '@/features/auth/useAuth';
import { dayOfMonth, formatEventRange, monthShort } from '@/lib/format';
import { EVENT_STATUS, enumOptions } from '@/lib/labels';
import type { EventItem, EventStatus } from '@/types/api';

import { useEvents, type EventFilters } from './api';
import { EventFormDialog } from './EventFormDialog';

type View = 'upcoming' | 'mine' | 'past' | 'all';

export default function EventsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('upcoming');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EventStatus | ''>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const filters: EventFilters = {
    page,
    search,
    status,
    timeframe: view === 'mine' ? 'upcoming' : view,
    mine: view === 'mine',
  };
  const query = useEvents(filters);

  const resetPage = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Events"
        description="Workshops, assemblies and activities of the organization."
        actions={
          <Can permission="events:manage">
            <Button icon={CalendarPlus} onClick={() => setCreating(true)}>
              New event
            </Button>
          </Can>
        }
      />

      <Card>
        <Tabs
          className="px-4"
          value={view}
          onChange={resetPage(setView)}
          items={[
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'mine', label: 'My registrations' },
            { key: 'past', label: 'Past' },
            { key: 'all', label: 'All' },
          ]}
        />
        <Toolbar>
          <SearchInput value={search} onChange={resetPage(setSearch)} placeholder="Search events or venues" className="w-full sm:w-72" />
          {can('events:manage') ? (
            <Select value={status} onChange={(e) => resetPage(setStatus)(e.target.value as EventStatus | '')} className="w-auto" aria-label="Status">
              <option value="">All statuses</option>
              {enumOptions(EVENT_STATUS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ) : null}
        </Toolbar>

        {query.isLoading ? (
          <LoadingBlock rows={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data && query.data.data.length > 0 ? (
          <>
            <ul className="divide-y divide-border">
              {query.data.data.map((event) => (
                <EventRow key={event.id} event={event} onOpen={() => navigate(`/events/${event.id}`)} />
              ))}
            </ul>
            <Pagination meta={query.data.meta} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title={view === 'mine' ? 'You have no upcoming registrations' : 'No events found'}
            description={view === 'mine' ? 'Browse upcoming events and register for the ones you want to join.' : 'Try a different search or filter.'}
          />
        )}
      </Card>

      {creating ? <EventFormDialog open onClose={() => setCreating(false)} onSaved={(event) => navigate(`/events/${event.id}`)} /> : null}
    </>
  );
}

function EventRow({ event, onOpen }: { event: EventItem; onOpen: () => void }) {
  const fill = Math.min(100, Math.round((event.registeredCount / event.capacity) * 100));
  return (
    <li>
      <div
        role="link"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => e.key === 'Enter' && onOpen()}
        className="flex cursor-pointer flex-col gap-4 px-4 py-4 transition-colors hover:bg-hover sm:flex-row sm:items-center"
      >
        <div className="flex w-14 shrink-0 flex-col items-center rounded-lg border border-border bg-muted py-1.5 text-center">
          <span className="text-[11px] font-semibold text-primary uppercase">{monthShort(event.startsAt)}</span>
          <span className="text-lg leading-none font-semibold text-fg">{dayOfMonth(event.startsAt)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/events/${event.id}`} className="font-medium text-fg hover:underline" onClick={(e) => e.stopPropagation()}>
              {event.name}
            </Link>
            <StatusBadge value={event.status} map={EVENT_STATUS} />
            {event.myRegistration ? <Badge tone="primary">Registered</Badge> : null}
            {event.myAttendance && event.myAttendance.status !== 'ABSENT' ? <Badge tone="success">Attended</Badge> : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
            <span>{formatEventRange(event.startsAt, event.endsAt)}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} aria-hidden />
              {event.location}
            </span>
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-44">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1">
              <Users size={13} aria-hidden /> {event.registeredCount} / {event.capacity}
            </span>
            <span>{event.isRegistrationOpen ? `${event.spotsLeft} spots left` : event.status === 'PUBLISHED' ? 'Registration closed' : ''}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-chart-track" aria-hidden>
            <div className="h-full rounded-full bg-chart" style={{ width: `${fill}%` }} />
          </div>
        </div>
      </div>
    </li>
  );
}
