import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { Pagination } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';

import { useMarkAllRead, useNotifications } from './api';
import { NotificationList } from './NotificationList';

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const query = useNotifications(page, filter === 'unread');
  const markAll = useMarkAllRead();

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Registration confirmations, reminders, certificates and approvals."
        actions={
          <Button variant="secondary" icon={CheckCheck} onClick={() => markAll.mutate()} loading={markAll.isPending} disabled={!query.data?.meta.unread}>
            Mark all as read
          </Button>
        }
      />
      <Card>
        <Tabs
          className="px-4"
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
          items={[
            { key: 'all', label: 'All' },
            { key: 'unread', label: 'Unread', count: query.data?.meta.unread },
          ]}
        />
        {query.isLoading ? (
          <LoadingBlock />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data && query.data.data.length > 0 ? (
          <>
            <NotificationList items={query.data.data} />
            <Pagination meta={query.data.meta} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState icon={Bell} title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} />
        )}
      </Card>
    </>
  );
}
