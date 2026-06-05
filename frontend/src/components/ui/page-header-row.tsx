import type { ReactNode } from 'react';
import { PageHeader } from './page-header';

interface PageHeaderRowProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export const PageHeaderRow = ({
  title,
  description,
  actions,
  className = 'mb-6',
}: PageHeaderRowProps) => (
  <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${className}`}>
    <PageHeader title={title} description={description} />
    {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
  </div>
);
