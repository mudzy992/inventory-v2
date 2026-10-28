/** Token-based skeletons; `aria-live` keeps screen readers informed. */
export const RoutePageFallback = () => (
  <div
    className="space-y-4 motion-safe:animate-pulse"
    role="status"
    aria-live="polite"
    aria-label="Učitavanje stranice"
  >
    <div className="h-8 w-48 rounded-[var(--radius-control)] bg-subtle" />
    <div className="h-4 w-full max-w-xl rounded bg-subtle/70" />
    <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
      <div className="h-24 rounded-[var(--radius-surface)] border border-line bg-subtle/70" />
      <div className="h-24 rounded-[var(--radius-surface)] border border-line bg-subtle/70" />
      <div className="hidden h-24 rounded-[var(--radius-surface)] border border-line bg-subtle/70 lg:block" />
    </div>
    <div className="h-64 rounded-[var(--radius-surface)] border border-line bg-panel" />
    <span className="sr-only">Učitavanje stranice…</span>
  </div>
);

export const FullScreenRouteFallback = () => (
  <div
    className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas text-ink-muted"
    role="status"
    aria-live="polite"
    aria-label="Učitavanje"
  >
    <div className="h-8 w-8 rounded-full border-2 border-line border-t-brand motion-safe:animate-spin" />
    <p className="text-sm">Učitavanje…</p>
  </div>
);
