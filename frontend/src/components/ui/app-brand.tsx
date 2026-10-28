import { cn } from '../../utils/cn';

export const EVIDENS_APP_NAME = 'Evidens';
export const EVIDENS_APP_SUBTITLE = 'Evidencija i zaduženje opreme';

interface AppBrandProps {
  variant?: 'auth' | 'sidebar' | 'compact' | 'light';
  name?: string;
  subtitle?: string;
  showSubtitle?: boolean;
  iconOnly?: boolean;
  className?: string;
}

/** Geometric "stacked inventory" mark — no text glyph that breaks on font swap. */
const BrandMark = ({ size, tone }: { size: 'sm' | 'md' | 'lg'; tone: 'brand' | 'on-dark' }) => {
  const box =
    size === 'sm'
      ? 'h-9 w-9 rounded-[0.7rem]'
      : size === 'md'
        ? 'h-12 w-12 rounded-[0.9rem]'
        : 'h-16 w-16 rounded-[1.15rem]';
  const icon = size === 'sm' ? 'h-5 w-5' : size === 'md' ? 'h-6 w-6' : 'h-8 w-8';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center shadow-surface',
        box,
        tone === 'brand' ? 'bg-brand text-white' : 'bg-white/10 text-white ring-1 ring-inset ring-white/25',
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className={icon} aria-hidden="true">
        <path
          d="M12 3.2 20.2 7.4 12 11.6 3.8 7.4 12 3.2Z"
          fill="currentColor"
          opacity="0.95"
        />
        <path
          d="M4.6 11.4 11.4 14.7a1.5 1.5 0 0 0 1.2 0l6.8-3.3M4.6 15.6l6.8 3.3a1.5 1.5 0 0 0 1.2 0l6.8-3.3"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
      </svg>
    </span>
  );
};

export const AppBrand = ({
  variant = 'auth',
  name = EVIDENS_APP_NAME,
  subtitle = EVIDENS_APP_SUBTITLE,
  showSubtitle = true,
  iconOnly = false,
  className,
}: AppBrandProps) => {
  if (variant === 'light') {
    return (
      <div className={cn('text-center', className)}>
        <div className="mb-3 inline-flex">
          <BrandMark size="md" tone="brand" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{name}</h1>
        {showSubtitle ? <p className="mt-2 text-sm font-medium text-ink-muted">{subtitle}</p> : null}
      </div>
    );
  }

  if (variant === 'compact') {
    if (iconOnly) {
      return (
        <div className={cn('inline-flex', className)} title={name}>
          <BrandMark size="sm" tone="brand" />
        </div>
      );
    }
    return (
      <div className={cn('inline-flex items-center gap-2', className)}>
        <BrandMark size="sm" tone="brand" />
        <span className="truncate text-sm font-semibold text-ink">{name}</span>
      </div>
    );
  }

  if (variant === 'sidebar') {
    return (
      <div className={cn('flex min-w-0 items-center gap-3', className)}>
        <BrandMark size="sm" tone="brand" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-tight tracking-tight text-ink">{name}</h1>
          {showSubtitle ? (
            <p className="truncate text-xs leading-tight text-ink-muted">{subtitle}</p>
          ) : null}
        </div>
      </div>
    );
  }

  // `auth` is used by the dark setup-wizard presentation; keep white text.
  return (
    <div className={cn('text-center', className)}>
      <div className="mb-4 inline-flex">
        <BrandMark size="lg" tone="on-dark" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{name}</h1>
      {showSubtitle ? <p className="mt-2 text-sm text-white/70">{subtitle}</p> : null}
    </div>
  );
};
