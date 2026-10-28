import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export const PageHeader = ({ title, description, eyebrow, actions }: PageHeaderProps) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow ? (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-[clamp(1.35rem,2.2vw,1.75rem)] font-semibold leading-tight tracking-tight text-ink">
        {title}
      </h1>
      {description ? (
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
      ) : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </div>
);
