import type { ReactNode } from 'react';
import { cardClass } from './form-styles';

interface DataTableProps {
  children: ReactNode;
  className?: string;
}

export const DataTable = ({ children, className = '' }: DataTableProps) => (
  <div className={`${cardClass} overflow-hidden ${className}`}>
    <div className="overflow-x-auto">{children}</div>
  </div>
);
