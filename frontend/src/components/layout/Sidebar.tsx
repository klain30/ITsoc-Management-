import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { CircuitPattern } from '@/components/ui/CircuitPattern';
import { useAuth } from '@/features/auth/useAuth';
import { useTotalUnread } from '@/features/chat/api';
import { getData } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Organization } from '@/types/api';

import { NAVIGATION } from './navigation';

export function Brand({ light = true }: { light?: boolean }) {
  const { data } = useQuery({ queryKey: ['organization'], queryFn: () => getData<Organization>('/organization'), staleTime: Infinity });
  return (
    <div className="flex items-center gap-3">
      <img src="/itsoc-logo.png" alt="" className="h-10 w-10 shrink-0 rounded-full shadow-[0_0_0_3px_rgba(1,112,191,0.35),0_0_18px_rgba(1,112,191,0.45)]" />
      <div className="min-w-0 leading-tight">
        <p className={cn('font-display truncate text-sm font-bold tracking-wide', light ? 'text-white' : 'text-fg')}>{data?.shortName ?? 'ITSoc'}</p>
        <p className={cn('truncate text-xs', light ? 'text-sidebar-muted' : 'text-fg-subtle')}>Management System</p>
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { canAny } = useAuth();
  const unreadMessages = useTotalUnread();

  const sections = NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.anyOf || canAny(...item.anyOf)),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn('fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-hidden bg-sidebar text-sidebar-fg transition-transform duration-300 ease-drawer lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div aria-hidden className="brand-stripe h-1 shrink-0" />
        {/* Cover-photo glow and circuit traces behind the navigation. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(120% 50% at 0% 100%, rgba(1,112,191,0.22), transparent 60%), radial-gradient(90% 40% at 100% 0%, rgba(19,0,172,0.25), transparent 60%)' }}
        />
        <CircuitPattern className="absolute inset-x-0 bottom-0 h-56 w-full text-sky-300/25" />
        <div className="relative flex h-16 items-center justify-between px-5">
          <Brand />
          <button type="button" onClick={onClose} className="rounded-md p-1 text-sidebar-muted hover:text-white lg:hidden" aria-label="Close menu">
            <X size={18} aria-hidden />
          </button>
        </div>
        <nav className="relative flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {sections.map((section, index) => (
            <div key={section.title ?? index}>
              {section.title ? (
                <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">{section.title}</p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          // Active item: brand-blue fill with the seal's orange as a leading marker.
                          isActive
                            ? 'bg-sidebar-active text-sidebar-active-fg before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-accent'
                            : 'text-sidebar-fg hover:bg-white/5 hover:text-white',
                        )
                      }
                    >
                      <item.icon size={18} aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      {item.badge === 'messages' && unreadMessages > 0 ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg tabular-nums">
                          {unreadMessages > 99 ? '99+' : unreadMessages}
                        </span>
                      ) : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="relative px-5 py-4 text-[11px] text-sidebar-muted">© {new Date().getFullYear()} Information Technology Society</p>
      </aside>
    </>
  );
}
