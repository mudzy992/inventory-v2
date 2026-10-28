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

  it('Fornax F-20 yields 56 labels of 52.5 x 21.2 mm', () => {
    const preset = LABEL_PRESETS.find((row) => row.id === 'fornax-f-20')!;
    const layout = computeLabelLayout(withGeometry(preset.geometry));
    expect(layout.labelsPerPage).toBe(56);
    expect(layout.labelWidthMm).toBeCloseTo(52.5, 1);
    expect(layout.labelHeightMm).toBeCloseTo(21.2, 1);
  });

  it('Fornax catalog: every F preset matches its declared label count', () => {
    const fornax = LABEL_PRESETS.filter((preset) => preset.group === 'fornax');
    expect(fornax.length).toBeGreaterThanOrEqual(19);
    for (const preset of fornax) {
      const expected = Number(/^(\d+)/.exec(preset.detail)?.[1]);
      const layout = computeLabelLayout(withGeometry({ ...preset.geometry, presetId: preset.id }));
      expect(layout.labelsPerPage, preset.id).toBe(expected);
      expect(layout.errors.filter((e) => !e.includes('premala')), preset.id).toEqual([]);
    }
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
    const borderless = computeLabelLayout(withGeometry({ marginTopMm: 0, presetId: 'custom' }));
    expect(borderless.warnings.some((row) => row.includes('3 mm'))).toBe(true);
    // Factory die-cut presets are edge-to-edge by design — no borderless noise.
    const presetEdge = computeLabelLayout(withGeometry({ marginTopMm: 0, presetId: 'fornax-f-21' }));
    expect(presetEdge.warnings.some((row) => row.includes('3 mm'))).toBe(false);
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

  it('forces the mandatory inventory number on and migrates legacy name toggles', () => {
    expect(sanitizeLabelSettings({ showInventoryNumber: false }).showInventoryNumber).toBe(true);
    const legacyOff = sanitizeLabelSettings({ showLotName: false, showDisplayName: false } as never);
    expect(legacyOff.showEquipmentName).toBe(false);
    const legacyOn = sanitizeLabelSettings({ showLotName: true } as never);
    expect(legacyOn.showEquipmentName).toBe(true);
  });

  it('falls back to defaults for garbage input', () => {
    expect(sanitizeLabelSettings(null)).toEqual(DEFAULT_LABEL_SETTINGS);
    expect(sanitizeLabelSettings({ orientation: 'sideways' as never }).orientation).toBe('portrait');
  });
});
