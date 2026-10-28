/**
 * Label printing layout engine — A4 sheets, die-cut presets, pagination.
 * Pure functions (no DOM) so the geometry can be unit tested.
 */

export const A4_PORTRAIT = { widthMm: 210, heightMm: 297 } as const;
export const MM_TO_PX = 96 / 25.4;

export type LabelOrientation = 'portrait' | 'landscape';
export type LabelQrPosition = 'left' | 'top';

export interface LabelPrintSettings {
  presetId: string;
  orientation: LabelOrientation;
  columns: number;
  rows: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  gapXMm: number;
  gapYMm: number;
  /** Number of cells to skip on the first sheet (partially used sticker sheet). */
  startOffset: number;
  copiesPerItem: number;
  showDisplayName: boolean;
  showLotName: boolean;
  showCategory: boolean;
  showSerial: boolean;
  showInventoryNumber: boolean;
  showScanHint: boolean;
  qrPosition: LabelQrPosition;
  /** QR size as % of the space available inside the label (40–100). */
  qrSizePercent: number;
  /** Print dashed cut guides around every label. */
  printGuides: boolean;
}

export interface LabelPreset {
  id: string;
  name: string;
  detail: string;
  geometry: Pick<
    LabelPrintSettings,
    | 'columns'
    | 'rows'
    | 'marginTopMm'
    | 'marginBottomMm'
    | 'marginLeftMm'
    | 'marginRightMm'
    | 'gapXMm'
    | 'gapYMm'
  >;
}

/** Standard die-cut A4 label sheets (Avery-compatible) + practical generic grids. */
export const LABEL_PRESETS: LabelPreset[] = [
  {
    id: 'avery-l7651',
    name: 'Avery L7651 · mini',
    detail: '65 naljepnica · 38,1 × 21,2 mm · 5 × 13',
    geometry: { columns: 5, rows: 13, marginTopMm: 10.7, marginBottomMm: 10.7, marginLeftMm: 4.7, marginRightMm: 4.7, gapXMm: 2.5, gapYMm: 0 },
  },
  {
    id: 'avery-l7159',
    name: 'Avery L7159',
    detail: '24 naljepnice · 63,5 × 33,9 mm · 3 × 8',
    geometry: { columns: 3, rows: 8, marginTopMm: 12.9, marginBottomMm: 12.9, marginLeftMm: 7.2, marginRightMm: 7.2, gapXMm: 2.5, gapYMm: 0 },
  },
  {
    id: 'avery-l7160',
    name: 'Avery L7160 · standard',
    detail: '21 naljepnica · 63,5 × 38,1 mm · 3 × 7',
    geometry: { columns: 3, rows: 7, marginTopMm: 15.1, marginBottomMm: 15.1, marginLeftMm: 7.2, marginRightMm: 7.2, gapXMm: 2.5, gapYMm: 0 },
  },
  {
    id: 'avery-l7161',
    name: 'Avery L7161',
    detail: '18 naljepnica · 63,5 × 46,6 mm · 3 × 6',
    geometry: { columns: 3, rows: 6, marginTopMm: 8.7, marginBottomMm: 8.7, marginLeftMm: 7.2, marginRightMm: 7.2, gapXMm: 2.5, gapYMm: 0 },
  },
  {
    id: 'avery-l7162',
    name: 'Avery L7162',
    detail: '16 naljepnica · 99,1 × 33,9 mm · 2 × 8',
    geometry: { columns: 2, rows: 8, marginTopMm: 12.9, marginBottomMm: 12.9, marginLeftMm: 4.6, marginRightMm: 4.6, gapXMm: 2.5, gapYMm: 0 },
  },
  {
    id: 'avery-l7163',
    name: 'Avery L7163',
    detail: '14 naljepnica · 99,1 × 38,1 mm · 2 × 7',
    geometry: { columns: 2, rows: 7, marginTopMm: 15.1, marginBottomMm: 15.1, marginLeftMm: 4.6, marginRightMm: 4.6, gapXMm: 2.5, gapYMm: 0 },
  },
  {
    id: 'generic-2x5',
    name: 'Mreža 2 × 5 · velike',
    detail: '10 naljepnica · ~93 × 52 mm · običan A4 papir',
    geometry: { columns: 2, rows: 5, marginTopMm: 10, marginBottomMm: 10, marginLeftMm: 10, marginRightMm: 10, gapXMm: 4, gapYMm: 4 },
  },
  {
    id: 'avery-l7165',
    name: 'Avery L7165 · velike',
    detail: '8 naljepnica · 99,1 × 67,7 mm · 2 × 4',
    geometry: { columns: 2, rows: 4, marginTopMm: 13.1, marginBottomMm: 13.1, marginLeftMm: 4.6, marginRightMm: 4.6, gapXMm: 2.5, gapYMm: 0 },
  },
  {
    id: 'generic-4x10',
    name: 'Mreža 4 × 10 · male',
    detail: '40 naljepnica · ~47 × 26 mm · običan A4 papir',
    geometry: { columns: 4, rows: 10, marginTopMm: 8, marginBottomMm: 8, marginLeftMm: 8, marginRightMm: 8, gapXMm: 2.5, gapYMm: 2 },
  },
  {
    id: 'avery-l7167',
    name: 'Avery L7167 · cijela strana',
    detail: '1 naljepnica · 199,6 × 289,1 mm · 1 × 1',
    geometry: { columns: 1, rows: 1, marginTopMm: 3.9, marginBottomMm: 3.9, marginLeftMm: 5.2, marginRightMm: 5.2, gapXMm: 0, gapYMm: 0 },
  },
];

export const DEFAULT_LABEL_SETTINGS: LabelPrintSettings = {
  presetId: 'avery-l7160',
  orientation: 'portrait',
  ...LABEL_PRESETS[2].geometry,
  startOffset: 0,
  copiesPerItem: 1,
  showDisplayName: true,
  showLotName: true,
  showCategory: true,
  showSerial: true,
  showInventoryNumber: true,
  showScanHint: false,
  qrPosition: 'left',
  qrSizePercent: 90,
  printGuides: false,
};

export interface LabelLayout {
  pageWidthMm: number;
  pageHeightMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  labelsPerPage: number;
  errors: string[];
  warnings: string[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export const computeLabelLayout = (settings: LabelPrintSettings): LabelLayout => {
  const pageWidthMm = settings.orientation === 'portrait' ? A4_PORTRAIT.widthMm : A4_PORTRAIT.heightMm;
  const pageHeightMm = settings.orientation === 'portrait' ? A4_PORTRAIT.heightMm : A4_PORTRAIT.widthMm;
  const columns = Math.max(1, Math.floor(settings.columns) || 1);
  const rows = Math.max(1, Math.floor(settings.rows) || 1);

  const labelWidthMm = round2(
    (pageWidthMm - settings.marginLeftMm - settings.marginRightMm - (columns - 1) * settings.gapXMm) / columns,
  );
  const labelHeightMm = round2(
    (pageHeightMm - settings.marginTopMm - settings.marginBottomMm - (rows - 1) * settings.gapYMm) / rows,
  );

  const errors: string[] = [];
  const warnings: string[] = [];
  if (settings.marginTopMm < 0 || settings.marginBottomMm < 0 || settings.marginLeftMm < 0 || settings.marginRightMm < 0) {
    errors.push('Margine ne mogu biti negativne.');
  }
  if (settings.gapXMm < 0 || settings.gapYMm < 0) {
    errors.push('Razmaci između naljepnica ne mogu biti negativni.');
  }
  if (labelWidthMm < 12 || labelHeightMm < 8) {
    errors.push(`Naljepnica je premala (${labelWidthMm} × ${labelHeightMm} mm) — smanji margine/razmake ili broj kolona/redova.`);
  } else if (Math.min(labelWidthMm, labelHeightMm) < 18) {
    warnings.push('QR kod će biti manji od 18 mm — skeniranje iz daljine može biti otežano.');
  }
  if (settings.marginLeftMm < 3 || settings.marginRightMm < 3 || settings.marginTopMm < 3 || settings.marginBottomMm < 3) {
    warnings.push('Margine ispod 3 mm: većina štampača ne štampa do ivice papira (borderless).');
  }

  return {
    pageWidthMm,
    pageHeightMm,
    labelWidthMm,
    labelHeightMm,
    labelsPerPage: columns * rows,
    errors,
    warnings,
  };
};

/** Expand items (copies) and chunk them into pages; first-page cells can be skipped. */
export const buildLabelPages = <T,>(
  items: readonly T[],
  labelsPerPage: number,
  startOffset: number,
  copiesPerItem: number,
): (T | null)[][] => {
  const perPage = Math.max(1, labelsPerPage);
  const offset = Math.min(Math.max(0, startOffset), perPage - 1);
  const copies = Math.min(50, Math.max(1, copiesPerItem));

  const cells: (T | null)[] = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (const item of items) {
    for (let copy = 0; copy < copies; copy += 1) cells.push(item);
  }
  if (cells.length === 0) cells.push(null);

  const pages: (T | null)[][] = [];
  for (let i = 0; i < cells.length; i += perPage) {
    pages.push(cells.slice(i, i + perPage));
  }
  return pages;
};

export const STORAGE_KEY = 'evidens.labelPrintSettings.v1';

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, num));
};

export const sanitizeLabelSettings = (raw: Partial<LabelPrintSettings> | null | undefined): LabelPrintSettings => {
  const base = DEFAULT_LABEL_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...base };
  const merged: LabelPrintSettings = { ...base, ...raw };
  return {
    ...merged,
    presetId: typeof merged.presetId === 'string' ? merged.presetId : 'custom',
    orientation: merged.orientation === 'landscape' ? 'landscape' : 'portrait',
    columns: Math.round(clamp(merged.columns, base.columns, 1, 12)),
    rows: Math.round(clamp(merged.rows, base.rows, 1, 30)),
    marginTopMm: clamp(merged.marginTopMm, base.marginTopMm, 0, 100),
    marginBottomMm: clamp(merged.marginBottomMm, base.marginBottomMm, 0, 100),
    marginLeftMm: clamp(merged.marginLeftMm, base.marginLeftMm, 0, 80),
    marginRightMm: clamp(merged.marginRightMm, base.marginRightMm, 0, 80),
    gapXMm: clamp(merged.gapXMm, base.gapXMm, 0, 30),
    gapYMm: clamp(merged.gapYMm, base.gapYMm, 0, 30),
    startOffset: Math.round(clamp(merged.startOffset, 0, 0, 500)),
    copiesPerItem: Math.round(clamp(merged.copiesPerItem, 1, 1, 50)),
    qrSizePercent: clamp(merged.qrSizePercent, base.qrSizePercent, 40, 100),
    qrPosition: merged.qrPosition === 'top' ? 'top' : 'left',
  };
};

export const loadLabelPrintSettings = (): LabelPrintSettings => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LABEL_SETTINGS };
    return sanitizeLabelSettings(JSON.parse(raw) as Partial<LabelPrintSettings>);
  } catch {
    return { ...DEFAULT_LABEL_SETTINGS };
  }
};

export const saveLabelPrintSettings = (settings: LabelPrintSettings): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode) — printing still works with in-memory settings.
  }
};
