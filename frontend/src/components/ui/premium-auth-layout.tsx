import { useEffect, type ReactNode } from 'react';

interface PremiumAuthLayoutProps {
  children: ReactNode;
  maxWidth?: 'md' | 'lg';
}

const maxWidthClass: Record<NonNullable<PremiumAuthLayoutProps['maxWidth']>, string> = {
  md: 'max-w-md',
  lg: 'max-w-lg',
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
        className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900"
        aria-hidden
      />
      <div
        className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(59,130,246,0.45),transparent)]"
        aria-hidden
      />
      <div
        className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(99,102,241,0.35),transparent)]"
        aria-hidden
      />
      <div
        className="fixed -top-32 -left-32 -z-10 h-[28rem] w-[28rem] rounded-full bg-blue-500/25 blur-3xl"
        aria-hidden
      />
      <div
        className="fixed -bottom-40 -right-24 -z-10 h-[32rem] w-[32rem] rounded-full bg-indigo-500/20 blur-3xl"
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
