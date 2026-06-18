import { useEffect, type ReactNode } from 'react';

interface PremiumAuthLayoutProps {
  children: ReactNode;
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl';
}

const maxWidthClass: Record<NonNullable<PremiumAuthLayoutProps['maxWidth']>, string> = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export const PremiumAuthLayout = ({ children, maxWidth = 'md' }: PremiumAuthLayoutProps) => {
  useEffect(() => {
    document.body.classList.add('auth-flow');
    return () => {
      document.body.classList.remove('auth-flow');
    };
  }, []);

  return (
    <div className="relative min-h-[100dvh] w-full py-8 sm:py-10">
      <div
        className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
        aria-hidden
      />
      <div
        className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(13,148,136,0.35),transparent)]"
        aria-hidden
      />
      <div
        className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(29,78,216,0.25),transparent)]"
        aria-hidden
      />
      <div
        className="fixed -top-32 -left-32 -z-10 h-[28rem] w-[28rem] rounded-full bg-teal-500/20 blur-3xl"
        aria-hidden
      />
      <div
        className="fixed -bottom-40 -right-24 -z-10 h-[32rem] w-[32rem] rounded-full bg-blue-600/15 blur-3xl"
        aria-hidden
      />
      <div
        className={`relative z-10 mx-auto w-full ${maxWidthClass[maxWidth]} px-4 sm:px-6`}
      >
        {children}
      </div>
    </div>
  );
};
