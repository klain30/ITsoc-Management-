import { LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-card',
  secondary: 'bg-surface text-fg border border-border hover:bg-hover shadow-card',
  ghost: 'text-fg-muted hover:bg-muted hover:text-fg',
  danger: 'bg-danger text-white hover:opacity-90 shadow-card',
  'danger-ghost': 'text-danger hover:bg-danger-soft',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
};

// eslint-disable-next-line react/only-export-components -- shared style helper
export const buttonClasses = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
  cn(
    'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2',
    VARIANTS[variant],
    SIZES[size],
    className,
  );

type CommonProps = { variant?: Variant; size?: Size; icon?: LucideIcon; children?: ReactNode };

export type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean };

export function Button({ variant, size, icon: Icon, loading, children, className, disabled, type = 'button', ...props }: ButtonProps) {
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <button type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading ? <LoaderCircle size={iconSize} className="animate-spin" aria-hidden /> : Icon ? <Icon size={iconSize} aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, icon: Icon, children, className, ...props }: CommonProps & LinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {Icon ? <Icon size={size === 'sm' ? 14 : 16} aria-hidden /> : null}
      {children}
    </Link>
  );
}

/** Square icon-only button; `label` is required for screen readers. */
export function IconButton({
  icon: Icon,
  label,
  className,
  ...props
}: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-muted hover:text-fg disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <Icon size={18} aria-hidden />
    </button>
  );
}
