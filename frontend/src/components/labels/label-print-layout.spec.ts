import { describe, expect, it } from 'vitest';
import {
  buildLabelPages,
  computeLabelLayout,
  DEFAULT_LABEL_SETTINGS,
  LABEL_PRESETS,
  sanitizeLabelSettings,
  type LabelPrintSettings,
} from './label-print-layout';

const withGeometry = (patch: Partial<LabelPrintSettings>): LabelPrintSettings => ({
  ...DEFAULT_LABEL_SETTINGS,
  ...patch,
});

describe('label-print-layout presets', () => {
  it('every preset fits the A4 portrait page exactly', () => {
    for (const preset of LABEL_PRESETS) {
      const layout = computeLabelLayout(withGeometry({ ...preset.geometry, orientation: 'portrait' }));
      expect(layout.errors, preset.id).toEqual([]);
      expect(layout.labelsPerPage, preset.id).toBe(preset.geometry.columns * preset.geometry.rows);
      expect(layout.labelWidthMm, preset.id).toBeGreaterThan(12);
      expect(layout.labelHeightMm, preset.id).toBeGreaterThan(8);
    }
  });

  it('L7160 yields 21 labels of ~63.5 x 38.1 mm', () => {
    const preset = LABEL_PRESETS.find((row) => row.id === 'avery-l7160')!;
    const layout = computeLabelLayout(withGeometry(preset.geometry));
    expect(layout.labelsPerPage).toBe(21);
    expect(layout.labelWidthMm).toBeCloseTo(63.53, 1);
    expect(layout.labelHeightMm).toBeCloseTo(38.11, 1);
  });

  it('L7651 yields 65 mini labels', () => {
    const preset = LABEL_PRESETS.find((row) => row.id === 'avery-l7651')!;
    const layout = computeLabelLayout(withGeometry(preset.geometry));
    expect(layout.labelsPerPage).toBe(65);
    expect(layout.labelWidthMm).toBeCloseTo(38.12, 1);
    expect(layout.labelHeightMm).toBeCloseTo(21.22, 1);
  });

  it('landscape swaps page dimensions', () => {
    const layout = computeLabelLayout(withGeometry({ orientation: 'landscape', columns: 4, rows: 3 }));
    expect(layout.pageWidthMm).toBe(297);
    expect(layout.pageHeightMm).toBe(210);
  });

  it('flags tiny labels as an error and sub-3mm margins as a warning', () => {
    const layout = computeLabelLayout(withGeometry({ columns: 12, rows: 30, marginLeftMm: 40, marginRightMm: 40 }));
    expect(layout.errors.length).toBeGreaterThan(0);
    const borderless = computeLabelLayout(withGeometry({ marginTopMm: 0 }));
    expect(borderless.warnings.some((row) => row.includes('3 mm'))).toBe(true);
  });
});

describe('buildLabelPages', () => {
  it('skips start cells on the first page only', () => {
    const pages = buildLabelPages(['a', 'b', 'c'], 4, 2, 1);
    expect(pages[0]).toEqual([null, null, 'a', 'b']);
    expect(pages[1]).toEqual(['c']);
  });

  it('repeats each item by copies and chunks pages', () => {
    const pages = buildLabelPages(['a', 'b'], 3, 0, 2);
    expect(pages).toEqual([['a', 'a', 'b'], ['b']]);
  });

  it('clamps the offset below the page size', () => {
    const pages = buildLabelPages(['a'], 4, 99, 1);
    expect(pages[0].slice(0, 3)).toEqual([null, null, null]);
    expect(pages[0][3]).toBe('a');
  });

  it('returns one placeholder page for no items', () => {
    expect(buildLabelPages([], 6, 0, 1)).toEqual([[null]]);
  });
});

describe('sanitizeLabelSettings', () => {
  it('clamps out-of-range numbers and keeps valid content flags', () => {
    const result = sanitizeLabelSettings({ columns: 99, marginLeftMm: -5, showCategory: false });
    expect(result.columns).toBe(12);
    expect(result.marginLeftMm).toBe(0);
    expect(result.showCategory).toBe(false);
    expect(result.showInventoryNumber).toBe(true);
  });

  it('falls back to defaults for garbage input', () => {
    expect(sanitizeLabelSettings(null)).toEqual(DEFAULT_LABEL_SETTINGS);
    expect(sanitizeLabelSettings({ orientation: 'sideways' as never }).orientation).toBe('portrait');
  });
});
