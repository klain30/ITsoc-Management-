import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '@/features/auth/useAuth';
import { getData } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Organization } from '@/types/api';

import { NAVIGATION } from './navigation';

export function Brand({ light = true }: { light?: boolean }) {
  const { data } = useQuery({ queryKey: ['organization'], queryFn: () => getData<Organization>('/organization'), staleTime: Infinity });
  return (
    <div className="flex items-center gap-3">
      <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-lg" />
      <div className="min-w-0 leading-tight">
        <p className={cn('truncate text-sm font-semibold', light ? 'text-white' : 'text-fg')}>{data?.shortName ?? 'ITSoc'}</p>
        <p className={cn('truncate text-xs', light ? 'text-sidebar-muted' : 'text-fg-subtle')}>Management System</p>
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { canAny } = useAuth();

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
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-fg transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Brand />
          <button type="button" onClick={onClose} className="rounded-md p-1 text-sidebar-muted hover:text-white lg:hidden" aria-label="Close menu">
            <X size={18} aria-hidden />
          </button>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
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
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive ? 'bg-sidebar-active text-sidebar-active-fg' : 'text-sidebar-fg hover:bg-white/5 hover:text-white',
                        )
                      }
                    >
                      <item.icon size={18} aria-hidden />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="px-5 py-4 text-[11px] text-sidebar-muted">© {new Date().getFullYear()} Information Technology Society</p>
      </aside>
    </>
  );
}
