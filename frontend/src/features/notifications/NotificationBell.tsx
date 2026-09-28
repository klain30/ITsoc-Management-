import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyState, Spinner } from '@/components/ui/Display';
import { Popover } from '@/components/ui/Popover';

import { useMarkAllRead, useNotifications, useUnreadCount } from './api';
import { NotificationList } from './NotificationList';

export function NotificationBell() {
  const { data: unread = 0 } = useUnreadCount();

  return (
    <Popover
      className="w-[min(24rem,calc(100vw-2rem))]"
      trigger={({ toggle, ...aria }) => (
        <button
          type="button"
          onClick={toggle}
          {...aria}
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-muted hover:text-fg"
        >
          <Bell size={18} aria-hidden />
          {unread > 0 ? (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      )}
    >
      {(close) => <NotificationPanel close={close} />}
    </Popover>
  );
}

function NotificationPanel({ close }: { close: () => void }) {
  const { data, isLoading } = useNotifications(1, false, 8);
  const markAll = useMarkAllRead();
  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Notifications</p>
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
          onClick={() => markAll.mutate()}
          disabled={!data?.meta.unread}
        >
          Mark all as read
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 text-center">
            <Spinner />
          </div>
        ) : data && data.data.length > 0 ? (
          <NotificationList items={data.data} onNavigate={close} />
        ) : (
          <EmptyState icon={Bell} title="You’re all caught up" className="py-8" />
        )}
      </div>
      <Link to="/notifications" onClick={close} className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-hover">
        View all notifications
      </Link>
    </div>
  );
}
