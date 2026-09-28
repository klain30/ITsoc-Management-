import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/Display';
import type { Permission } from '@/types/api';

import { useAuth } from './useAuth';

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="Loading your session" />
    </div>
  );
}

/** Redirects anonymous users to /login, remembering where they were going. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return children ?? <Outlet />;
}

/** Keeps signed-in users away from /login. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') {
    const next = new URLSearchParams(location.search).get('next');
    // Only allow same-app relative paths (no open redirects).
    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
    return <Navigate to={safe} replace />;
  }
  return children;
}

export function Forbidden() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You don’t have access to this page"
      description="Your role does not include this permission. If you think this is a mistake, contact the organization president."
      action={<ButtonLink to="/dashboard" variant="secondary">Back to dashboard</ButtonLink>}
      className="py-24"
    />
  );
}

/** Route guard: renders <Forbidden/> unless the user has any of the permissions. */
export function RequirePermission({ anyOf, children }: { anyOf: Permission[]; children?: ReactNode }) {
  const { canAny } = useAuth();
  if (!canAny(...anyOf)) return <Forbidden />;
  return children ?? <Outlet />;
}

/** Inline gate for buttons and sections. */
export function Can({ permission, anyOf, children, fallback = null }: { permission?: Permission; anyOf?: Permission[]; children: ReactNode; fallback?: ReactNode }) {
  const { can, canAny } = useAuth();
  const allowed = permission ? can(permission) : anyOf ? canAny(...anyOf) : false;
  return allowed ? children : fallback;
}
