import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useState, type HTMLAttributes, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import type { PageMeta } from '@/types/api';

import { Input } from './Form';

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-sm', className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-border bg-muted/60 text-xs font-medium text-fg-subtle">{children}</thead>;
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn('px-4 py-2.5 font-medium whitespace-nowrap', className)} {...props} />;
}

export function Tr({ className, onClick, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-b border-border last:border-0', onClick && 'cursor-pointer transition-colors hover:bg-hover', className)}
      onClick={onClick}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle text-fg', className)} {...props} />;
}

export function Pagination({ meta, onPageChange }: { meta: PageMeta; onPageChange: (page: number) => void }) {
  if (meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-fg-muted">
      <span className="tabular">
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(meta.total)}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40"
          onClick={() => onPageChange(meta.page - 1)}
          disabled={meta.page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        <span className="px-2 tabular">
          Page {meta.page} of {meta.totalPages}
        </span>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40"
          onClick={() => onPageChange(meta.page + 1)}
          disabled={meta.page >= meta.totalPages}
          aria-label="Next page"
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Search box that reports its value after the user stops typing. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  delay = 300,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  delay?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // Parent reset the value (e.g. cleared filters): adopt it.
    setLastValue(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), delay);
    return () => clearTimeout(timer);
  }, [draft, value, onChange, delay]);

  return (
    <div className={cn('relative', className)}>
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-subtle" aria-hidden />
      <Input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pr-8 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            onChange('');
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-fg-subtle hover:text-fg"
        >
          <X size={14} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Row of filter controls above a list. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-2 border-b border-border px-4 py-3', className)}>{children}</div>;
}
