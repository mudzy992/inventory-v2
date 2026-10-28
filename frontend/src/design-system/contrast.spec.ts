import { describe, expect, it } from 'vitest';
import { contrastRatio, meetsWcagAA, relativeLuminance } from './contrast';

describe('WCAG contrast math', () => {
  it('returns the canonical 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#FFFFFF', '#000000')).toBe(21);
  });

  it('is symmetric and returns 1 for identical colours', () => {
    expect(contrastRatio('#4f46e5', '#f7f9fc')).toBe(
      contrastRatio('#f7f9fc', '#4f46e5'),
    );
    expect(contrastRatio('#4f46e5', '#4f46e5')).toBe(1);
  });

  it('supports 3-digit hex and a missing hash', () => {
    expect(relativeLuminance('#fff')).toBe(1);
    expect(relativeLuminance('000')).toBe(0);
    expect(contrastRatio('fff', '000')).toBe(21);
  });

  it('rejects malformed colours instead of silently returning NaN', () => {
    for (const bad of ['', 'blue', '#12345', '#gggggg', 'rgb(0,0,0)']) {
      expect(() => relativeLuminance(bad)).toThrow(/Not a hex colour/u);
    }
  });

  it('implements the 4.5 / 3.0 AA thresholds', () => {
    expect(meetsWcagAA('#767676', '#ffffff')).toBe(true); // ~4.54
    expect(meetsWcagAA('#888888', '#ffffff')).toBe(false); // ~3.54
    expect(meetsWcagAA('#888888', '#ffffff', true)).toBe(true); // large text
  });
});
