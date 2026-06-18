import { cn } from '../../utils/cn';

export const EVIDENS_APP_NAME = 'Evidens';
export const EVIDENS_APP_SUBTITLE = 'Evidencija i zaduženje opreme';

interface AppBrandProps {
  variant?: 'auth' | 'sidebar' | 'compact';
  name?: string;
  subtitle?: string;
  showSubtitle?: boolean;
  iconOnly?: boolean;
  className?: string;
}

const BrandMark = ({ size }: { size: 'sm' | 'md' | 'lg' }) => {
  const box =
    size === 'sm' ? 'w-8 h-8 rounded-lg text-xs' : size === 'md' ? 'w-12 h-12 rounded-xl text-sm' : 'w-16 h-16 rounded-2xl text-lg';
  return (
    <div
      className={cn(
        'flex items-center justify-center font-bold tracking-tight shrink-0',
        box,
        size === 'lg'
          ? 'bg-white/10 border border-white/20 text-white shadow-lg shadow-slate-950/30 backdrop-blur-md'
          : size === 'md'
            ? 'bg-teal-600 text-white shadow-md shadow-teal-900/20'
            : 'bg-teal-600 text-white',
      )}
      aria-hidden
    >
      E
    </div>
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
  if (variant === 'compact') {
    if (iconOnly) {
      return (
        <div className={cn('inline-flex', className)}>
          <BrandMark size="sm" />
        </div>
      );
    }
    return (
      <div className={cn('inline-flex items-center gap-2', className)}>
        <BrandMark size="sm" />
        <span className="font-semibold text-sm truncate">{name}</span>
      </div>
    );
  }
  if (variant === 'sidebar') {
    return (
      <div className={cn('flex items-center gap-3 min-w-0', className)}>
        <BrandMark size="sm" />
        <div className="min-w-0">
          <h1 className="font-bold text-sm leading-tight truncate">{name}</h1>
          {showSubtitle ? (
            <p className="text-xs text-slate-400 leading-tight truncate">{subtitle}</p>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className={cn('text-center', className)}>
      <div className="inline-flex mb-4">
        <BrandMark size="lg" />
      </div>
      <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">{name}</h1>
      {showSubtitle ? <p className="text-teal-200/80 text-sm mt-2">{subtitle}</p> : null}
    </div>
  );
};
