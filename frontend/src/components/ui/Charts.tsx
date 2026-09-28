import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/*
 * Small, dependency-free chart primitives. All are single-series, so they
 * use one validated chart hue (--chart) and need no legend: the card title
 * names what is plotted. Values and labels use text tokens, never the mark
 * color. Every mark has a hover tooltip, and every chart renders its numbers
 * as text as well, so nothing depends on reading color alone.
 */

// ─── Stat tile ──────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">{label}</p>
        {Icon ? <Icon size={18} className="text-fg-subtle" aria-hidden /> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-fg">{value}</p>
      {hint ? <p className="mt-1 text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

// ─── Meter (a single ratio against a limit) ─────────────────────────────────

/**
 * The fill carries severity (chart hue → warning → danger); the track is a
 * lighter step of the same hue so the state reads across the whole bar.
 */
export function Meter({
  value,
  label,
  warnAt = 80,
  dangerAt = 95,
  className,
}: {
  value: number;
  label: string;
  warnAt?: number;
  dangerAt?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const fill = value >= dangerAt ? 'bg-danger' : value >= warnAt ? 'bg-warning' : 'bg-chart';
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-chart-track', className)}
      title={`${label}: ${value}%`}
    >
      <div className={cn('h-full rounded-full transition-[width]', fill)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

// ─── Bar list (horizontal bars: compare magnitude) ──────────────────────────

export type BarDatum = { key: string; label: ReactNode; value: number; display: string; href?: string };

/**
 * Horizontal bars with the value at the tip. Bars are 10px thick with a 4px
 * rounded data-end and a square start at the shared baseline.
 */
export function BarList({ data, max, className, emptyLabel = 'No data yet' }: { data: BarDatum[]; max?: number; className?: string; emptyLabel?: string }) {
  if (data.length === 0) return <p className="py-6 text-center text-sm text-fg-subtle">{emptyLabel}</p>;
  const scaleMax = max ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className={cn('space-y-3', className)}>
      {data.map((datum) => {
        const width = Math.max(0, Math.min(100, (datum.value / scaleMax) * 100));
        return (
          <li key={datum.key} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-fg-muted">{datum.label}</span>
              <span className="shrink-0 font-medium text-fg tabular">{datum.display}</span>
            </div>
            <div className="relative h-2.5 w-full">
              <div
                className="h-full rounded-r-[4px] bg-chart transition-opacity group-hover:opacity-80"
                style={{ width: `${width}%`, minWidth: datum.value > 0 ? 3 : 0 }}
                title={`${typeof datum.label === 'string' ? datum.label : ''} ${datum.display}`.trim()}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Column chart (change over a few periods) ───────────────────────────────

export type ColumnDatum = { key: string; label: string; value: number; display: string };

/**
 * Vertical columns from a single baseline, one hairline gridline at the top
 * value. Only the latest column is labelled on its cap; the rest reveal
 * their value in a hover tooltip.
 */
export function ColumnChart({ data, height = 160, className }: { data: ColumnDatum[]; height?: number; className?: string }) {
  if (data.length === 0) return <p className="py-6 text-center text-sm text-fg-subtle">No data yet</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const last = data.length - 1;
  return (
    <div className={className}>
      <div className="relative flex items-end gap-2 border-b border-border" style={{ height }} role="img" aria-label="Column chart">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-border" aria-hidden />
        {data.map((datum, index) => {
          const h = Math.max(datum.value > 0 ? 3 : 0, (datum.value / max) * (height - 24));
          return (
            <div key={datum.key} className="group relative flex h-full flex-1 flex-col items-center justify-end">
              {index === last ? <span className="mb-1 text-xs font-medium text-fg tabular">{datum.display}</span> : null}
              <div
                className="w-full max-w-6 rounded-t-[4px] bg-chart transition-opacity group-hover:opacity-80"
                style={{ height: h }}
              />
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md border border-border bg-surface px-2 py-1 text-xs whitespace-nowrap text-fg shadow-pop group-hover:block">
                <span className="text-fg-muted">{datum.label}</span> · <span className="font-medium tabular">{datum.display}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((datum) => (
          <span key={datum.key} className="flex-1 text-center text-xs text-fg-subtle">
            {datum.label}
          </span>
        ))}
      </div>
    </div>
  );
}
