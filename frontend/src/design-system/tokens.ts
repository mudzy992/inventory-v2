/**
 * Evidens Surface — the testable mirror of the CSS custom properties in
 * `src/index.css`. `scripts/check-frontend-contract.mjs` and
 * `tokens.spec.ts` keep the two in sync so a token cannot silently drift.
 *
 * Rule: redesigned components use semantic Tailwind utilities generated from
 * these tokens (`bg-panel`, `text-ink`, `border-line`, `bg-brand`, ...).
 * Raw hex values belong here and in CSS only, never in component markup.
 */
export const DESIGN_TOKENS = {
  canvas: '#f7f9fc',
  panel: '#ffffff',
  subtle: '#f1f5f9',
  ink: '#111827',
  'ink-muted': '#5b6779',
  'ink-subtle': '#7c8798',
  line: '#e5eaf1',
  'line-strong': '#d4dce7',
  brand: '#4f46e5',
  'brand-hover': '#4338ca',
  'brand-soft': '#eef2ff',
  'brand-ink': '#3730a3',
  'success-ink': '#15803d',
  'warning-ink': '#b45309',
  'danger-ink': '#b91c1c',
  'danger-hover': '#991b1b',
  'success-soft': '#ecfdf5',
  'warning-soft': '#fffbeb',
  'danger-soft': '#fef2f2',
  focus: '#4f46e5',
} as const;

export type DesignTokenName = keyof typeof DESIGN_TOKENS;

/** Text/background pairs that MUST satisfy WCAG 2.2 AA (>= 4.5:1). */
export const REQUIRED_AA_PAIRS = [
  { name: 'body text on canvas', foreground: 'ink', background: 'canvas' },
  { name: 'body text on panel', foreground: 'ink', background: 'panel' },
  { name: 'muted text on panel', foreground: 'ink-muted', background: 'panel' },
  { name: 'muted text on subtle', foreground: 'ink-muted', background: 'subtle' },
  { name: 'muted text on canvas', foreground: 'ink-muted', background: 'canvas' },
  { name: 'brand label on soft', foreground: 'brand-ink', background: 'brand-soft' },
  { name: 'white text on brand', foreground: '#ffffff', background: 'brand' },
  { name: 'white text on brand hover', foreground: '#ffffff', background: 'brand-hover' },
  { name: 'danger text on panel', foreground: 'danger-ink', background: 'panel' },
  { name: 'white text on danger', foreground: '#ffffff', background: 'danger-ink' },
  { name: 'success text on panel', foreground: 'success-ink', background: 'panel' },
  { name: 'warning text on panel', foreground: 'warning-ink', background: 'panel' },
  { name: 'success text on soft', foreground: 'success-ink', background: 'success-soft' },
  { name: 'warning text on soft', foreground: 'warning-ink', background: 'warning-soft' },
  { name: 'danger text on soft', foreground: 'danger-ink', background: 'danger-soft' },
] as const;

export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3;

/** Semantic radii / shadows kept here so component tests can assert them. */
export const SURFACE_RADII = {
  surface: '0.875rem',
  control: '0.625rem',
} as const;
