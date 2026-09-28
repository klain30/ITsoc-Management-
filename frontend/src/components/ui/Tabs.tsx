import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type TabItem<K extends string> = { key: K; label: ReactNode; count?: number };

/** Controlled, underline-style tabs (roving selection via aria-selected). */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('flex gap-1 overflow-x-auto border-b border-border', className)}>
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.key)}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              selected ? 'border-primary text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className={cn('rounded-full px-1.5 text-xs tabular', selected ? 'bg-primary-soft text-primary-soft-fg' : 'bg-muted text-fg-subtle')}>
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
