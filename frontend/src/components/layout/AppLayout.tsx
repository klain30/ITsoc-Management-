import { ChevronDown, LogOut, Menu, Moon, Sun, UserRound } from 'lucide-react';
import { Suspense, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { Avatar, Spinner } from '@/components/ui/Display';
import { MenuItem, Popover } from '@/components/ui/Popover';
import { useToast } from '@/components/ui/Toast';
import { useCurrentUser, useAuth } from '@/features/auth/useAuth';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { ROLE_LABELS } from '@/lib/labels';
import { useTheme } from '@/lib/theme';

import { Sidebar } from './Sidebar';

function UserMenu() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const toast = useToast();
  const name = `${user.firstName} ${user.lastName}`;

  return (
    <Popover
      className="w-64 p-1.5"
      trigger={({ toggle: toggleMenu, ...aria }) => (
        <button
          type="button"
          onClick={toggleMenu}
          {...aria}
          aria-label="Account menu"
          className="flex items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 hover:bg-muted"
        >
          <Avatar name={name} size="sm" />
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium text-fg">{name}</span>
            <span className="block text-xs text-fg-subtle">{user.position ?? ROLE_LABELS[user.role]}</span>
          </span>
          <ChevronDown size={14} className="hidden text-fg-subtle sm:block" aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="border-b border-border px-3 pt-2 pb-3">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-fg-subtle">{user.email}</p>
          </div>
          <div className="pt-1.5">
            <MenuItem
              icon={<UserRound size={16} aria-hidden />}
              onClick={() => {
                close();
                navigate('/profile');
              }}
            >
              My profile
            </MenuItem>
            <MenuItem icon={theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />} onClick={toggle}>
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </MenuItem>
            <MenuItem
              tone="danger"
              icon={<LogOut size={16} aria-hidden />}
              onClick={async () => {
                close();
                await logout();
                toast.info('You have been signed out.');
              }}
            >
              Sign out
            </MenuItem>
          </div>
        </>
      )}
    </Popover>
  );
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="-ml-1 rounded-lg p-2 text-fg-muted hover:bg-muted lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} aria-hidden />
          </button>
          <div className="flex-1" />
          <NotificationBell />
          <UserMenu />
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <Suspense
            fallback={
              <div className="flex justify-center py-24">
                <Spinner />
              </div>
            }
          >
            {/* Keyed by path so each page fades up into place when you navigate. */}
            <div key={pathname} className="animate-enter">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
