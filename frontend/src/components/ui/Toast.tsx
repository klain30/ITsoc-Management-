import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (messageOrError: unknown) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const STYLES: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-info',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      info: (message) => push('info', message),
      error: (value) => push('error', value instanceof Error ? value.message : typeof value === 'string' ? value : 'Something went wrong.'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind];
          return (
            <div
              key={toast.id}
              role={toast.kind === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg shadow-pop transition-[opacity,transform] duration-300 ease-snappy starting:translate-y-3 starting:opacity-0"
            >
              <Icon size={18} className={cn('mt-0.5 shrink-0', STYLES[toast.kind])} aria-hidden />
              <p className="flex-1">{toast.message}</p>
              <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss" className="text-fg-subtle hover:text-fg">
                <X size={16} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react/only-export-components
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
};
