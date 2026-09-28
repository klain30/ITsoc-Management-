import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { getData } from '@/lib/api';
import type { Organization } from '@/types/api';

/** Split-screen layout for sign-in, set-password and the public verification page. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { data: org } = useQuery({ queryKey: ['organization'], queryFn: () => getData<Organization>('/organization'), staleTime: Infinity });

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-xl" />
            <div className="leading-tight">
              <p className="font-semibold text-fg">{org?.name ?? 'Information Technology Society'}</p>
              <p className="text-xs text-fg-subtle">{org?.university ?? 'Management System'}</p>
            </div>
          </div>
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-sidebar lg:block">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(45,212,191,0.35), transparent 40%), radial-gradient(circle at 80% 70%, rgba(59,130,246,0.25), transparent 45%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <p className="text-sm font-medium tracking-wide text-teal-300 uppercase">{org?.shortName ?? 'ITSoc'} Management System</p>
          <h2 className="mt-3 max-w-md text-3xl leading-tight font-semibold">
            Members, events, attendance and finances — in one place.
          </h2>
          <ul className="mt-6 space-y-2 text-sm text-slate-300">
            <li>• QR check-in with rotating codes</li>
            <li>• Verifiable certificates with a public QR check</li>
            <li>• Budgets, approvals and a complete audit trail</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
