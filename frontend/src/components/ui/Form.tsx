import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

const controlBase =
  'w-full rounded-lg border bg-surface text-sm text-fg placeholder:text-fg-subtle transition-colors ' +
  'focus:outline-none focus:ring-3 focus:ring-[var(--ring)] focus:border-primary disabled:bg-muted disabled:text-fg-muted';

const controlBorder = (invalid?: boolean) => (invalid ? 'border-danger' : 'border-border-strong/70');

export type ControlProps = { invalid?: boolean };

export function Input({ className, invalid, ref, ...props }: InputHTMLAttributes<HTMLInputElement> & ControlProps & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(controlBase, controlBorder(invalid), 'h-9 px-3', className)} {...props} />;
}

export function Textarea({
  className,
  invalid,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlBase, controlBorder(invalid), 'min-h-24 px-3 py-2 leading-relaxed', className)}
      {...props}
    />
  );
}

export function Select({
  className,
  invalid,
  ref,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & ControlProps & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={cn(controlBase, controlBorder(invalid), 'h-9 px-2.5 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

/**
 * Label + control + hint/error. The render-prop receives the generated id
 * so the label and error message are wired to the control for assistive tech.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; 'aria-describedby'?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {children({ id, 'aria-describedby': error || hint ? messageId : undefined, invalid: Boolean(error) })}
      {error ? (
        <p id={messageId} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-fg', className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-border-strong accent-[var(--primary)]" {...props} />
      {label}
    </label>
  );
}

/** Banner for a form-level (non-field) error. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}
