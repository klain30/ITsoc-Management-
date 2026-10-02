import { CircleAlert, Inbox, LoaderCircle, RefreshCw, type LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import type { Tone } from '@/lib/labels';

import { Button } from './Button';

// ─── Card ───────────────────────────────────────────────────────────────────

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface shadow-card', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="font-display text-sm font-bold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-fg-subtle">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

// ─── Badge ──────────────────────────────────────────────────────────────────

const TONES: Record<Tone, string> = {
  neutral: 'bg-muted text-fg-muted',
  primary: 'bg-primary-soft text-primary-soft-fg',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export function Badge({ tone = 'neutral', dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Badge for any enum that has a { label, tone } entry in lib/labels. */
export function StatusBadge<K extends string>({ value, map }: { value: K; map: Record<K, { label: string; tone: Tone }> }) {
  const entry = map[value];
  return (
    <Badge tone={entry.tone} dot>
      {entry.label}
    </Badge>
  );
}

// ─── Loading / empty / error ────────────────────────────────────────────────

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-fg-muted', className)}>
      <LoaderCircle size={18} className="animate-spin text-primary" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden />;
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('h-5', i % 2 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-fg ring-8 ring-primary-soft/40">
        <Icon size={20} aria-hidden />
      </div>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)} role="alert">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger">
        <CircleAlert size={20} aria-hidden />
      </div>
      <p className="text-sm font-semibold text-fg">Couldn’t load this</p>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

// ─── Page header ────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-sm text-fg-subtle">{eyebrow}</div> : null}
        <h1 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ─── Avatar ─────────────────────────────────────────────────────────────────

export function Avatar({ name, src, size = 'md', className }: { name: string; src?: string | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-16 w-16 text-lg' };
  return src ? (
    <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', sizes[size], className)} />
  ) : (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-soft-fg', sizes[size], className)}
    >
      {initials(name)}
    </span>
  );
}

// ─── Description list ───────────────────────────────────────────────────────

export function DetailList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-4 sm:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium text-fg-subtle">{item.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-fg">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
