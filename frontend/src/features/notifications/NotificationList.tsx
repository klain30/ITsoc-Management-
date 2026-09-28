import { Award, Ban, Bell, CalendarCheck, CalendarClock, CircleCheck, CircleX, HandCoins, Megaphone, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import type { NotificationItem, NotificationType } from '@/types/api';

import { useMarkRead } from './api';

const ICONS: Record<NotificationType, LucideIcon> = {
  EVENT_REGISTRATION_CONFIRMED: CalendarCheck,
  EVENT_REMINDER: CalendarClock,
  EVENT_CANCELLED: Ban,
  CERTIFICATE_AVAILABLE: Award,
  ANNOUNCEMENT_PUBLISHED: Megaphone,
  EXPENSE_APPROVED: CircleCheck,
  EXPENSE_REJECTED: CircleX,
  EXPENSE_REIMBURSED: HandCoins,
};

export function NotificationList({ items, onNavigate }: { items: NotificationItem[]; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const markRead = useMarkRead();

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const Icon = ICONS[item.type] ?? Bell;
        const unread = !item.readAt;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                if (unread) markRead.mutate(item.id);
                if (item.link) {
                  navigate(item.link);
                  onNavigate?.();
                }
              }}
              className={cn('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-hover', unread && 'bg-primary-soft/40')}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-fg-muted">
                <Icon size={16} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className={cn('truncate text-sm', unread ? 'font-semibold text-fg' : 'text-fg')}>{item.title}</span>
                  {unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-sm text-fg-muted">{item.body}</span>
                <span className="mt-1 block text-xs text-fg-subtle">{formatRelative(item.createdAt)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
