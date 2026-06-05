import { cn } from '../../utils/cn';

export interface BadgeProps {
  children: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

const toneClass = {
  neutral: 'bg-gray-100 text-gray-700',
  info: 'bg-blue-100 text-blue-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-900',
  danger: 'bg-red-100 text-red-800',
};

export const Badge = ({ children, tone = 'neutral' }: BadgeProps) => (
  <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', toneClass[tone])}>
    {children}
  </span>
);
