import type { ReactNode } from 'react';
import { cardClass } from './form-styles';

interface ResponsiveTableProps {
  mobile: ReactNode;
  desktop: ReactNode;
  className?: string;
  emptyMessage?: string;
  isEmpty?: boolean;
}

export const ResponsiveTable = ({
  mobile,
  desktop,
  className = '',
  emptyMessage,
  isEmpty,
}: ResponsiveTableProps) => (
  <div className={`${cardClass} overflow-hidden ${className}`}>
    {isEmpty && emptyMessage ? (
      <p className="p-8 text-center text-gray-400 text-sm">{emptyMessage}</p>
    ) : (
      <>
        <div className="md:hidden divide-y divide-gray-100">{mobile}</div>
        <div className="hidden md:block overflow-x-auto">{desktop}</div>
      </>
    )}
  </div>
);
