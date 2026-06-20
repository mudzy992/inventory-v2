import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, FileQuestion, ShieldOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppBrand } from './app-brand';
import { Button } from './button';
import { PremiumAuthLayout } from './premium-auth-layout';
import { cn } from '../../utils/cn';

type HttpStatusCode = 403 | 404;

interface HttpStatusMeta {
  title: string;
  defaultDescription: string;
  icon: LucideIcon;
  badgeClass: string;
  iconWrapClass: string;
  codeClass: string;
}

const STATUS_META: Record<HttpStatusCode, HttpStatusMeta> = {
  403: {
    title: 'Pristup odbijen',
    defaultDescription: 'Nemate dozvolu za ovu stranicu ili resurs.',
    icon: ShieldOff,
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    iconWrapClass: 'bg-amber-50 text-amber-600 ring-amber-100',
    codeClass: 'text-amber-500/20',
  },
  404: {
    title: 'Stranica nije pronađena',
    defaultDescription: 'Adresa ne postoji ili je premještena.',
    icon: FileQuestion,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    iconWrapClass: 'bg-slate-50 text-slate-600 ring-slate-100',
    codeClass: 'text-slate-400/30',
  },
};

interface HttpStatusPageProps {
  status: HttpStatusCode;
  title?: string;
  description?: string;
  showCode?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  variant?: 'fullscreen' | 'embedded';
  showBrand?: boolean;
  children?: ReactNode;
}

const HttpStatusContent = ({
  status,
  title,
  description,
  showCode = true,
  actionLabel = 'Na početnu',
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  showBrand = false,
  children,
}: HttpStatusPageProps) => {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const message = description?.trim() || meta.defaultDescription;
  const heading = title?.trim() || meta.title;

  return (
    <div className="flex flex-col items-center text-center">
      {showBrand ? (
        <div className="mb-8">
          <AppBrand variant="light" />
        </div>
      ) : null}
      <div
        className={cn(
          'relative w-full max-w-md overflow-hidden rounded-2xl border bg-white/95 p-8 shadow-xl backdrop-blur-sm',
          status === 403 ? 'border-amber-100 shadow-amber-950/5' : 'border-slate-200 shadow-slate-950/5',
        )}
      >
        <p
          className={cn(
            'pointer-events-none absolute -right-2 -top-4 select-none text-[7rem] font-bold leading-none',
            meta.codeClass,
            !showCode && 'hidden',
          )}
          aria-hidden
        >
          {status}
        </p>
        <div className="relative">
          <div
            className={cn(
              'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl ring-1',
              meta.iconWrapClass,
            )}
          >
            <Icon size={30} strokeWidth={1.75} aria-hidden />
          </div>
          <span
            className={cn(
              'mb-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
              meta.badgeClass,
              !showCode && 'hidden',
            )}
          >
            {status}
          </span>
          <h1 className="text-xl font-semibold text-slate-900">{heading}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{message}</p>
          {children}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {onAction ? (
              <Button type="button" onClick={onAction} className="min-w-[9rem]">
                <ArrowLeft size={16} aria-hidden />
                {actionLabel}
              </Button>
            ) : null}
            {onSecondaryAction && secondaryActionLabel ? (
              <Button type="button" variant="secondary" onClick={onSecondaryAction} className="min-w-[9rem]">
                {secondaryActionLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export const HttpStatusPage = ({
  variant = 'embedded',
  showBrand,
  ...props
}: HttpStatusPageProps) => {
  if (variant === 'fullscreen') {
    return (
      <PremiumAuthLayout maxWidth="2xl">
        <HttpStatusContent {...props} showBrand={showBrand ?? true} />
      </PremiumAuthLayout>
    );
  }
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-12">
      <HttpStatusContent {...props} showBrand={showBrand ?? false} />
    </div>
  );
};
