import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and prevents double submits. */
  loading?: boolean;
  children: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover shadow-surface',
  secondary: 'bg-panel text-ink border border-line hover:bg-subtle',
  outline: 'bg-transparent text-brand-ink border border-brand/40 hover:bg-brand-soft',
  ghost: 'text-ink-muted hover:bg-subtle hover:text-ink',
  danger: 'bg-danger-ink text-white hover:bg-danger-hover',
  subtle: 'bg-brand-soft text-brand-ink hover:brightness-95',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5 rounded-[var(--radius-control)]',
  md: 'px-3.5 py-2 text-sm gap-2 rounded-[var(--radius-control)]',
  lg: 'px-4 py-2.5 text-sm gap-2 rounded-[var(--radius-control)]',
};

/**
 * Evidens Surface button. `type` defaults to "button" so a button inside a
 * form can never submit it accidentally (F-5). Focus is provided globally by
 * the `:focus-visible` rule in index.css, never removed by a utility reset.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    className,
    children,
    type = 'button',
    loading = false,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors',
        'disabled:opacity-50 disabled:pointer-events-none',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  );
});
