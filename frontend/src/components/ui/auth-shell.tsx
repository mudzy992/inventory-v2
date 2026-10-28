import { useEffect, type ReactNode } from 'react';
import { Boxes, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { AppBrand, EVIDENS_APP_NAME, EVIDENS_APP_SUBTITLE } from './app-brand';

interface AuthShellProps {
  children: ReactNode;
  appName?: string;
  appSubtitle?: string;
  /** Short, honest product facts — no marketing claims or fake metrics. */
  highlights?: readonly string[];
}

const DEFAULT_HIGHLIGHTS = [
  'Jedno mjesto za opremu, zaduženja i popis',
  'Jasna historija kretanja i odgovornosti',
  'Kontrola pristupa po ulogama i organizaciji',
] as const;

const HIGHLIGHT_ICONS = [Boxes, ClipboardCheck, ShieldCheck] as const;

/**
 * Modern light authentication shell. `body.auth-flow` is still toggled so the
 * global `overflow: hidden` baseline (needed by the fixed app shell) does not
 * clip this scrollable page.
 */
export const AuthShell = ({
  children,
  appName = EVIDENS_APP_NAME,
  appSubtitle = EVIDENS_APP_SUBTITLE,
  highlights = DEFAULT_HIGHLIGHTS,
}: AuthShellProps) => {
  useEffect(() => {
    document.body.classList.add('auth-flow');
    return () => {
      document.body.classList.remove('auth-flow');
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <div className="grid min-h-[100dvh] lg:grid-cols-2">
        <aside className="ds-auth-panel hidden flex-col justify-between p-10 lg:flex xl:p-14">
          <div className="ds-on-brand relative z-10 flex items-center gap-3">
            <AppBrand variant="compact" iconOnly name={appName} showSubtitle={false} />
            <span className="text-base font-semibold tracking-tight text-white">{appName}</span>
          </div>
          <div className="relative z-10 max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
              {appSubtitle}
            </p>
            <h2 className="mt-4 text-[clamp(1.8rem,3vw,2.6rem)] font-semibold leading-tight tracking-tight text-white">
              Pouzdana evidencija,
              <br />
              bez suvišnih koraka.
            </h2>
            <ul className="mt-9 space-y-4">
              {highlights.map((text, index) => {
                const Icon = HIGHLIGHT_ICONS[index % HIGHLIGHT_ICONS.length];
                return (
                  <li key={text} className="flex items-start gap-3 text-sm text-white/90">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/15">
                      <Icon size={15} aria-hidden="true" />
                    </span>
                    <span className="leading-relaxed">{text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="relative z-10 text-xs text-white/80/70">
            © {new Date().getFullYear()} {appName}
          </p>
        </aside>

        <main id="main-content" className="flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[26rem]">
            <div className="mb-7 lg:hidden">
              <AppBrand variant="light" name={appName} subtitle={appSubtitle} />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
