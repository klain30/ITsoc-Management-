import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Minimal disclosure popover: closes on outside click and Escape. `trigger`
 * receives the open state and the props to spread on the trigger button.
 */
export function Popover({
  trigger,
  children,
  align = 'right',
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void; 'aria-expanded': boolean }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v), 'aria-expanded': open })}
      {open ? (
        <div
          className={cn(
            'absolute z-40 mt-2 rounded-xl border border-border bg-surface shadow-pop',
            // Grows out of its trigger corner.
            'transition-[opacity,transform] duration-150 ease-snappy starting:scale-95 starting:opacity-0',
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  tone,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
        tone === 'danger' ? 'text-danger' : 'text-fg',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
