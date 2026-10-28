/**
 * Shared form control classes built on Evidens Surface tokens.
 * Keyboard focus is guaranteed by the global `:focus-visible` outline; here we
 * only add a soft brand ring and a visible border on focus, never remove the
 * outline (no outline reset).
 */
const base =
  'w-full rounded-[var(--radius-control)] border border-line bg-panel px-3 py-2 text-sm text-ink ' +
  'placeholder:text-ink-subtle transition-colors hover:border-line-strong ' +
  'focus:border-brand focus:ring-2 focus:ring-brand/20 ' +
  'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-subtle';

export const inputClass = `${base} min-h-10`;
export const selectClass = `${base} min-h-10 appearance-none pr-8`;
export const textareaClass = `${base} min-h-24 resize-y`;
export const labelClass = 'mb-1.5 block text-xs font-semibold text-ink-muted';
export const cardClass =
  'rounded-[var(--radius-surface)] border border-line bg-panel shadow-surface';
export const fieldErrorClass = 'mt-1 text-xs font-medium text-danger-ink';
