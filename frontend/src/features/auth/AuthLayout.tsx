import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { CircuitPattern } from '@/components/ui/CircuitPattern';
import { getData } from '@/lib/api';
import type { Organization } from '@/types/api';

const FEATURES = ['QR check-in with rotating codes', 'Verifiable certificates with a public QR check', 'Budgets, approvals and a complete audit trail'];

/** Split-screen layout for sign-in, set-password and the public verification page. */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { data: org } = useQuery({ queryKey: ['organization'], queryFn: () => getData<Organization>('/organization'), staleTime: Infinity });

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm animate-enter">
          <div className="mb-8 flex items-center gap-3">
            <img src="/itsoc-logo.png" alt="ITSoc seal" className="h-12 w-12 shrink-0 rounded-full" />
            <div className="leading-tight">
              <p className="font-display font-bold text-fg">{org?.name ?? 'Information Technology Society'}</p>
              <p className="text-xs text-fg-subtle">{org?.university ?? 'Management System'}</p>
            </div>
          </div>
          {children}
        </div>
      </div>
      <div className="relative hidden flex-col overflow-hidden bg-brand-navy lg:flex">
        {/* The official cover photo, faded into the panel's navy at its lower edge. */}
        <img
          src="/itsoc-cover.png"
          alt="Information Technology Society — the official organization of MMSU Information Technology students"
          className="w-full animate-cover-in [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-2/3 opacity-50"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 85%, rgba(1,112,191,0.35), transparent 45%), radial-gradient(circle at 90% 60%, rgba(19,0,172,0.35), transparent 45%)',
          }}
        />
        <CircuitPattern className="absolute inset-x-0 bottom-0 h-1/2 w-full text-sky-300/20" />
        <div className="stagger relative mt-auto p-12 text-white">
          <p className="text-sm font-semibold tracking-wider text-accent uppercase">{org?.shortName ?? 'ITSoc'} Management System</p>
          <h2 className="mt-3 max-w-md font-display text-3xl leading-tight font-bold">Members, events, attendance and finances — in one place.</h2>
          <ul className="stagger mt-6 space-y-2.5 text-sm text-sidebar-fg">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-3">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
