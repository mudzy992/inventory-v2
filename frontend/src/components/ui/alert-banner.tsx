import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface AlertBannerProps {
  tone?: 'info' | 'warning' | 'success';
  className?: string;
  children: ReactNode;
}

const toneClass = {
  info: 'bg-blue-50 border-blue-200 text-blue-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  success: 'bg-green-50 border-green-200 text-green-900',
};

export const AlertBanner = ({ tone = 'info', className, children }: AlertBannerProps) => (
  <div className={cn('text-xs border rounded-lg p-2', toneClass[tone], className)}>{children}</div>
);
