import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface BadgeProps {
  children: ReactNode;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  className?: string;
}

const toneClass: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-subtle text-ink-muted ring-line',
  info: 'bg-brand-soft text-brand-ink ring-brand/15',
  success: 'bg-success-soft text-success-ink ring-success-ink/15',
  warning: 'bg-warning-soft text-warning-ink ring-warning-ink/15',
  danger: 'bg-danger-soft text-danger-ink ring-danger-ink/15',
};

export const Badge = ({ children, tone = 'neutral', className }: BadgeProps) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
      toneClass[tone],
      className,
    )}
  >
    {children}
  </span>
);
