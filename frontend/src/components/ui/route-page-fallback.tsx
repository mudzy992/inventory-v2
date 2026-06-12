export const RoutePageFallback = () => (
  <div className="animate-pulse space-y-4" role="status" aria-live="polite" aria-label="Učitavanje stranice">
    <div className="h-8 w-48 rounded-lg bg-gray-200" />
    <div className="h-4 w-full max-w-xl rounded bg-gray-100" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
      <div className="h-24 rounded-xl bg-gray-100" />
      <div className="h-24 rounded-xl bg-gray-100" />
      <div className="h-24 rounded-xl bg-gray-100 hidden lg:block" />
    </div>
    <div className="h-64 rounded-xl bg-gray-50 border border-gray-100" />
    <span className="sr-only">Učitavanje stranice…</span>
  </div>
);

export const FullScreenRouteFallback = () => (
  <div
    className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-600 gap-3"
    role="status"
    aria-live="polite"
    aria-label="Učitavanje"
  >
    <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" />
    <p className="text-sm">Učitavanje…</p>
  </div>
);
