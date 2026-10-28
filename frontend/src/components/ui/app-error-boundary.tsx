import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from './button';

/** Structured, PII-free signal for future telemetry; no raw error text in logs. */
export const APP_RENDER_ERROR_EVENT = 'app:render-error';

export interface AppRenderErrorDetail {
  name: string;
  componentStack: string | null;
}

interface AppErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * F-2: the whole SPA used to render a blank white screen on any render error
 * (no componentDidCatch / getDerivedStateFromError anywhere in 254 files).
 * This boundary contains the failure to a recoverable, accessible panel.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const detail: AppRenderErrorDetail = {
      name: error.name || 'Error',
      componentStack: info.componentStack ?? null,
    };
    window.dispatchEvent(new CustomEvent(APP_RENDER_ERROR_EVENT, { detail }));
    this.props.onError?.(error, info);
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    return (
      <div
        className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4 py-10 text-ink"
        role="alert"
        aria-live="assertive"
      >
        <div className="w-full max-w-md rounded-[var(--radius-surface)] border border-line bg-panel p-8 text-center shadow-raised">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning-ink">
            <TriangleAlert size={22} aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Nešto je pošlo po zlu</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Stranica se nije mogla prikazati. Vaši podaci nisu izgubljeni — pokušajte ponovo, a ako
            se greška ponovi, osvježite cijelu aplikaciju.
          </p>
          <p className="mt-3 text-xs text-ink-subtle">Šifra greške: {error.name || 'Error'}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="primary" onClick={this.retry}>
              <RefreshCw size={16} aria-hidden="true" /> Pokušaj ponovo
            </Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              <RotateCcw size={16} aria-hidden="true" /> Osvježi aplikaciju
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
