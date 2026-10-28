interface AppLoadingScreenProps {
  label?: string;
  detail?: string;
}

/** Shared, branded loading state for the two AppShell boot phases (F-10). */
export const AppLoadingScreen = ({
  label = 'Učitavanje…',
  detail,
}: AppLoadingScreenProps) => (
  <div
    className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-canvas px-6 text-center"
    role="status"
    aria-live="polite"
  >
    <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-surface)] bg-brand text-white shadow-raised">
      <span className="text-lg font-bold tracking-tight" aria-hidden="true">
        E
      </span>
    </div>
    <div className="h-6 w-6 rounded-full border-2 border-line border-t-brand motion-safe:animate-spin" aria-hidden="true" />
    <div>
      <p className="text-sm font-medium text-ink">{label}</p>
      {detail ? <p className="mt-1 text-xs text-ink-muted">{detail}</p> : null}
    </div>
  </div>
);
