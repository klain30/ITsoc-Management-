import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { authApi, onSessionExpired, refreshSession, setAccessToken } from '@/lib/api';
import type { AuthPayload, Permission, SessionUser } from '@/types/api';

type Status = 'loading' | 'authenticated' | 'anonymous';

export type AuthContextValue = {
  status: Status;
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  /** Adopt a session returned by set-password / change-password. */
  acceptSession: (payload: AuthPayload) => void;
  /** Re-read the current user (e.g. after a profile or role change). */
  reload: () => Promise<void>;
  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
};

// eslint-disable-next-line react/only-export-components -- context is consumed by useAuth()
export const AuthContext = createContext<AuthContextValue | null>(null);

const CHANNEL = 'itsoc-auth';

/**
 * Restores the session on load via the refresh cookie, and keeps tabs in
 * sync: signing out in one tab signs out all of them.
 *
 * Permission checks here only decide what the UI shows. Every rule is
 * enforced again by the API.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  const acceptSession = useCallback((payload: AuthPayload) => {
    setAccessToken(payload.accessToken);
    setUser(payload.user);
    setStatus('authenticated');
  }, []);

  const reload = useCallback(async () => {
    const payload = await refreshSession();
    if (payload) acceptSession(payload);
    else clear();
  }, [acceptSession, clear]);

  useEffect(() => {
    // Restoring the session from the refresh cookie is synchronising with an external system.
    // eslint-disable-next-line react/set-state-in-effect
    void reload();
    onSessionExpired(clear);

    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel(CHANNEL);
      channel.current.onmessage = (event: MessageEvent<string>) => {
        if (event.data === 'logout') clear();
        if (event.data === 'login') void reload();
      };
    }
    return () => channel.current?.close();
  }, [reload, clear]);

  const value = useMemo<AuthContextValue>(() => {
    const permissions = new Set(user?.permissions ?? []);
    return {
      status,
      user,
      acceptSession,
      reload,
      login: async (email, password) => {
        const payload = await authApi.login(email, password);
        acceptSession(payload);
        channel.current?.postMessage('login');
        return payload.user;
      },
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          clear();
          channel.current?.postMessage('logout');
        }
      },
      can: (permission) => permissions.has(permission),
      canAny: (...list) => list.some((permission) => permissions.has(permission)),
    };
  }, [status, user, acceptSession, reload, clear]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
