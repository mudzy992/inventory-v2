import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESIGN_TOKENS,
  REQUIRED_AA_PAIRS,
  SURFACE_RADII,
  WCAG_AA_NORMAL,
} from './tokens';
import { contrastRatio } from './contrast';

const cssPath = [resolve(process.cwd(), 'src/index.css'), resolve(process.cwd(), '../frontend/src/index.css')].find(
  existsSync,
);
if (!cssPath) throw new Error('Cannot locate src/index.css for the token contract test');
const css = readFileSync(cssPath, 'utf8');
type TokenName = keyof typeof DESIGN_TOKENS;
const resolveToken = (value: string): string =>
  value.startsWith('#') ? value : DESIGN_TOKENS[value as TokenName];

describe('Evidens Surface design tokens', () => {
  it('every token is a valid 6-digit hex colour', () => {
    for (const [name, value] of Object.entries(DESIGN_TOKENS)) {
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/iu);
    }
  });

  it('CSS and TypeScript token mirrors stay in sync (no drift)', () => {
    for (const [name, value] of Object.entries(DESIGN_TOKENS)) {
      expect(css, `--color-${name}`).toContain(`--color-${name}: ${value};`);
    }
  });

  it('semantic radii are declared in CSS', () => {
    expect(css).toContain(`--radius-surface: ${SURFACE_RADII.surface};`);
    expect(css).toContain(`--radius-control: ${SURFACE_RADII.control};`);
  });

  it('all required text/background pairs satisfy WCAG AA', () => {
    for (const pair of REQUIRED_AA_PAIRS) {
      const ratio = contrastRatio(resolveToken(pair.foreground), resolveToken(pair.background));
      expect(ratio, pair.name).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    }
  });

  it('the global focus indicator and reduced-motion baseline exist', () => {
    expect(css).toMatch(/:focus-visible\s*\{/u);
    expect(css).toContain('outline: 2px solid var(--color-focus)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.ds-skip-link');
    expect(css).toContain('prefers-contrast: more');
  });

  it('brand and hover colours are distinct but both legible with white', () => {
    expect(DESIGN_TOKENS.brand).not.toBe(DESIGN_TOKENS['brand-hover']);
    for (const key of ['brand', 'brand-hover', 'danger-ink'] as const) {
      expect(contrastRatio('#ffffff', DESIGN_TOKENS[key])).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    }
  });
});
