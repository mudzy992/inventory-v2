import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, LayoutGrid, MousePointerClick, Printer, RotateCcw, X } from 'lucide-react';
import type { Category, Equipment } from '../types';
import {
  buildEquipmentDisplayName,
  buildEquipmentQrUrl,
  getSerialNumberDisplay,
} from '../helpers/equipment-display.util';
import { isAccountingTrackedEquipment } from '../helpers/equipment-accounting-tracked.util';
import { ModalRoot } from './ui/modal-root';
import { MODAL_Z } from '../constants/modal-z-index';
import {
  buildLabelPages,
  computeLabelLayout,
  DEFAULT_LABEL_SETTINGS,
  LABEL_PRESETS,
  loadLabelPrintSettings,
  MM_TO_PX,
  saveLabelPrintSettings,
  type LabelPreset,
  type LabelPrintSettings,
} from './labels/label-print-layout';

interface LabelPrintSheetProps {
  items: Equipment[];
  categories: Category[];
  onClose: () => void;
}

const fmtMm = (value: number): string =>
  `${(Math.round(value * 10) / 10).toString().replace('.', ',')} mm`;

const GEOMETRY_KEYS: (keyof LabelPreset['geometry'])[] = [
  'columns',
  'rows',
  'marginTopMm',
  'marginBottomMm',
  'marginLeftMm',
  'marginRightMm',
  'gapXMm',
  'gapYMm',
];

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 0.5,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const parsed = Number.parseFloat(event.target.value.replace(',', '.'));
          onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
      />
    </div>
  );
}

function ToggleField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer py-0.5">
      <input
        id={id}
        type="checkbox"
        className="w-4 h-4 rounded border-gray-300 accent-blue-600"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

export const LabelPrintSheet = ({ items, categories, onClose }: LabelPrintSheetProps) => {
  const [settings, setSettings] = useState<LabelPrintSettings>(() => loadLabelPrintSettings());
  const [pickStartMode, setPickStartMode] = useState(false);
  const [zoom, setZoom] = useState<'fit' | 0.5 | 0.75 | 1>('fit');
  const previewRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(960);

  useEffect(() => {
    saveLabelPrintSettings(settings);
  }, [settings]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => computeLabelLayout(settings), [settings]);
  const startOffset = Math.min(Math.max(0, settings.startOffset), Math.max(0, layout.labelsPerPage - 1));
  const pages = useMemo(
    () => buildLabelPages(items, layout.labelsPerPage, startOffset, settings.copiesPerItem),
    [items, layout.labelsPerPage, startOffset, settings.copiesPerItem],
  );
  const totalLabels = items.length * Math.max(1, settings.copiesPerItem);

  const patchSettings = (patch: Partial<LabelPrintSettings>) => {
    setSettings((prev) => {
      const touchesGeometry = GEOMETRY_KEYS.some((key) => key in patch);
      return {
        ...prev,
        ...patch,
        presetId: patch.presetId ?? (touchesGeometry ? 'custom' : prev.presetId),
      };
    });
  };

  const applyPreset = (preset: LabelPreset) => {
    patchSettings({ ...preset.geometry, presetId: preset.id });
  };

  const resetSettings = () => {
    setSettings({ ...DEFAULT_LABEL_SETTINGS });
    setPickStartMode(false);
  };

  const sheetPxWidth = layout.pageWidthMm * MM_TO_PX;
  const sheetPxHeight = layout.pageHeightMm * MM_TO_PX;
  const scale =
    zoom === 'fit'
      ? Math.min(1, Math.max(0.15, (containerWidth - 32) / sheetPxWidth))
      : zoom;

  const hasErrors = layout.errors.length > 0;
  const handlePrint = () => {
    if (hasErrors) return;
    window.print();
  };

  const renderLabelContent = (item: Equipment) => {
    const category = categories.find((row) => row.id === item.categoryId);
    const qrData = buildEquipmentQrUrl(item);
    const lotName = item.stockLot?.productName?.trim();
    const displayName = buildEquipmentDisplayName(category, item.specifications);
    const serial = getSerialNumberDisplay(category, item.specifications);
    const isTracked = isAccountingTrackedEquipment(item);

    const labelH = layout.labelHeightMm;
    const density = labelH < 16 ? 'micro' : labelH < 26 ? 'compact' : 'full';
    const padMm = density === 'full' ? 1.8 : 1.1;
    const qrAvailableMm =
      settings.qrPosition === 'left'
        ? labelH - padMm * 2
        : Math.min(layout.labelWidthMm * 0.5, labelH * 0.52);
    const qrMm = Math.max(8, (qrAvailableMm * settings.qrSizePercent) / 100);
    const nameSizeMm = density === 'full' ? 3.3 : 2.7;
    const metaSizeMm = density === 'full' ? 2.4 : 2.1;
    const invSizeMm = density === 'full' ? 4 : 3.2;

    const showName = settings.showDisplayName && density !== 'micro' && Boolean(displayName);
    const showLot = settings.showLotName && density === 'full' && Boolean(lotName);
    const showCat = settings.showCategory && density !== 'micro' && Boolean(category?.name);
    const showSerial = settings.showSerial && density !== 'micro' && Boolean(serial);
    const showHint = settings.showScanHint && density === 'full';

    const texts = (
      <div
        className={`flex-1 min-w-0 flex flex-col justify-center ${settings.qrPosition === 'top' ? 'items-center text-center' : 'text-left'}`}
        style={{ gap: '0.6mm' }}
      >
        {showLot ? (
          <p className="font-semibold text-gray-900 leading-tight line-clamp-2" style={{ fontSize: `${nameSizeMm}mm` }}>
            {lotName}
          </p>
        ) : null}
        {showName ? (
          <p
            className={`${showLot ? 'text-gray-700' : 'font-semibold text-gray-900'} leading-tight line-clamp-2`}
            style={{ fontSize: `${showLot ? metaSizeMm + 0.3 : nameSizeMm}mm` }}
          >
            {displayName}
          </p>
        ) : null}
        {showCat ? (
          <p className="text-gray-600 truncate" style={{ fontSize: `${metaSizeMm}mm` }}>
            {category?.name}
          </p>
        ) : null}
        {showSerial && serial ? (
          <p className="text-gray-700 truncate" style={{ fontSize: `${metaSizeMm}mm` }}>
            <span className="text-gray-500">{serial.label}:</span> {serial.value}
          </p>
        ) : null}
        {settings.showInventoryNumber ? (
          isTracked ? (
            <p className="font-mono font-bold text-gray-900 tracking-tight" style={{ fontSize: `${invSizeMm}mm` }}>
              {item.inventoryNumber}
            </p>
          ) : (
            <p
              className="font-mono font-bold text-gray-900 tracking-tight border-b border-gray-900"
              style={{ fontSize: `${invSizeMm}mm`, minHeight: `${invSizeMm + 1}mm`, minWidth: '24mm' }}
              aria-label="Prazna linija za ručni upis inventurnog broja"
            >
              {'\u00A0'}
            </p>
          )
        ) : null}
        {showHint ? (
          <p className="text-gray-500" style={{ fontSize: `${metaSizeMm - 0.2}mm` }}>
            Skeniraj za detalje
          </p>
        ) : null}
      </div>
    );

    return (
      <div
        className={`w-full h-full flex ${settings.qrPosition === 'top' ? 'flex-col items-center justify-center' : 'flex-row items-center'}`}
        style={{ padding: `${padMm}mm`, gap: `${padMm}mm` }}
      >
        <div className="shrink-0 flex items-center justify-center" style={{ width: `${qrMm}mm`, height: `${qrMm}mm` }}>
          <QRCodeSVG value={qrData} size={Math.max(32, Math.round(qrMm * MM_TO_PX))} level="M" />
        </div>
        {texts}
      </div>
    );
  };

  return (
    <ModalRoot open onClose={onClose} zIndex={MODAL_Z.destructive} size="full" panelClassName="max-w-[1440px] print:max-w-none" enableEscape closeOnBackdrop>
      <div className={`bg-white rounded-xl shadow-xl w-full print:shadow-none label-print-root ${settings.printGuides ? '' : 'guides-off'}`}>
        <div className="flex flex-col h-[94dvh] print:h-auto">
          <div className="p-4 border-b flex flex-wrap justify-between items-center gap-3 print:hidden">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <LayoutGrid size={18} /> Štampa QR naljepnica
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {items.length} artikala × {Math.max(1, settings.copiesPerItem)} kopija = {totalLabels} naljepnica ·{' '}
                {layout.labelsPerPage} po listu · {pages.length} {pages.length === 1 ? 'list' : 'listova'} A4 · naljepnica{' '}
                {fmtMm(layout.labelWidthMm)} × {fmtMm(layout.labelHeightMm)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePrint}
                disabled={hasErrors}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                <Printer size={14} /> Štampaj
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm flex items-center gap-1.5">
                <X size={14} /> Zatvori
              </button>
            </div>
          </div>

          <div className="flex flex-1 min-h-0">
            <aside className="w-[320px] shrink-0 border-r overflow-y-auto p-4 space-y-6 print:hidden">
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Format lista (A4)</h3>
                <label htmlFor="label-preset" className="block text-xs font-medium text-gray-600 mb-1">
                  Standardni format naljepnica
                </label>
                <select
                  id="label-preset"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={settings.presetId}
                  onChange={(event) => {
                    const preset = LABEL_PRESETS.find((row) => row.id === event.target.value);
                    if (preset) applyPreset(preset);
                  }}
                >
                  {settings.presetId === 'custom' ? (
                    <option value="custom">Prilagođeno (ručne mjere)</option>
                  ) : null}
                  {LABEL_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name} — {preset.detail}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2 mt-3" role="group" aria-label="Orijentacija lista">
                  {(
                    [
                      { id: 'portrait', label: 'Uspravno (A4)' },
                      { id: 'landscape', label: 'Vodoravno (A4)' },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={settings.orientation === option.id}
                      onClick={() => patchSettings({ orientation: option.id })}
                      className={`px-2 py-1.5 text-xs rounded-lg border ${
                        settings.orientation === option.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Margine lista (mm)</h3>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField id="lm-top" label="Gornja" value={settings.marginTopMm} min={0} max={100} onChange={(v) => patchSettings({ marginTopMm: v })} />
                  <NumberField id="lm-bottom" label="Donja" value={settings.marginBottomMm} min={0} max={100} onChange={(v) => patchSettings({ marginBottomMm: v })} />
                  <NumberField id="lm-left" label="Lijeva" value={settings.marginLeftMm} min={0} max={80} onChange={(v) => patchSettings({ marginLeftMm: v })} />
                  <NumberField id="lm-right" label="Desna" value={settings.marginRightMm} min={0} max={80} onChange={(v) => patchSettings({ marginRightMm: v })} />
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Raspored naljepnica</h3>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField id="lm-cols" label="Kolona" value={settings.columns} min={1} max={12} step={1} onChange={(v) => patchSettings({ columns: Math.round(v) })} />
                  <NumberField id="lm-rows" label="Redova" value={settings.rows} min={1} max={30} step={1} onChange={(v) => patchSettings({ rows: Math.round(v) })} />
                  <NumberField id="lm-gapx" label="Razmak ↔ (mm)" value={settings.gapXMm} min={0} max={30} step={0.1} onChange={(v) => patchSettings({ gapXMm: v })} />
                  <NumberField id="lm-gapy" label="Razmak ↕ (mm)" value={settings.gapYMm} min={0} max={30} step={0.1} onChange={(v) => patchSettings({ gapYMm: v })} />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Veličina naljepnice: <strong>{fmtMm(layout.labelWidthMm)} × {fmtMm(layout.labelHeightMm)}</strong> ·{' '}
                  {layout.labelsPerPage} po listu
                </p>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Početna pozicija i kopije</h3>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    id="lm-offset"
                    label="Preskoči polja (1. list)"
                    value={startOffset}
                    min={0}
                    max={Math.max(0, layout.labelsPerPage - 1)}
                    step={1}
                    onChange={(v) => patchSettings({ startOffset: Math.round(v) })}
                  />
                  <NumberField id="lm-copies" label="Kopija po artiklu" value={settings.copiesPerItem} min={1} max={50} step={1} onChange={(v) => patchSettings({ copiesPerItem: Math.round(v) })} />
                </div>
                <button
                  type="button"
                  aria-pressed={pickStartMode}
                  onClick={() => setPickStartMode((prev) => !prev)}
                  className={`mt-2 w-full px-3 py-2 text-xs rounded-lg border flex items-center justify-center gap-1.5 ${
                    pickStartMode ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <MousePointerClick size={13} /> {pickStartMode ? 'Klikni polje na prvom listu…' : 'Odaberi početak klikom na pregled'}
                </button>
                <p className="text-xs text-gray-400 mt-1">Za djelimično iskorišten list naljepnica.</p>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Sadržaj naljepnice</h3>
                <ToggleField id="lc-name" label="Naziv opreme (specifikacije)" checked={settings.showDisplayName} onChange={(v) => patchSettings({ showDisplayName: v })} />
                <ToggleField id="lc-lot" label="Naziv lota / proizvoda" checked={settings.showLotName} onChange={(v) => patchSettings({ showLotName: v })} />
                <ToggleField id="lc-cat" label="Kategorija" checked={settings.showCategory} onChange={(v) => patchSettings({ showCategory: v })} />
                <ToggleField id="lc-serial" label="Serijski broj (ako postoji)" checked={settings.showSerial} onChange={(v) => patchSettings({ showSerial: v })} />
                <ToggleField id="lc-inv" label="Inventurni broj / linija za upis" checked={settings.showInventoryNumber} onChange={(v) => patchSettings({ showInventoryNumber: v })} />
                <ToggleField id="lc-hint" label="Tekst „Skeniraj za detalje”" checked={settings.showScanHint} onChange={(v) => patchSettings({ showScanHint: v })} />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label htmlFor="lc-qr-pos" className="block text-xs font-medium text-gray-600 mb-1">
                      Pozicija QR koda
                    </label>
                    <select
                      id="lc-qr-pos"
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={settings.qrPosition}
                      onChange={(event) => patchSettings({ qrPosition: event.target.value as LabelPrintSettings['qrPosition'] })}
                    >
                      <option value="left">Lijevo</option>
                      <option value="top">Gore</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="lc-qr-size" className="block text-xs font-medium text-gray-600 mb-1">
                      Veličina QR ({settings.qrSizePercent}%)
                    </label>
                    <input
                      id="lc-qr-size"
                      type="range"
                      min={40}
                      max={100}
                      step={5}
                      value={settings.qrSizePercent}
                      onChange={(event) => patchSettings({ qrSizePercent: Number(event.target.value) })}
                      className="w-full accent-blue-600 mt-2"
                    />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Pregled i štampa</h3>
                <ToggleField id="lp-guides" label="Štampaj vodilje (okvir naljepnice)" checked={settings.printGuides} onChange={(v) => patchSettings({ printGuides: v })} />
                <label htmlFor="lp-zoom" className="block text-xs font-medium text-gray-600 mb-1 mt-2">
                  Zum pregleda
                </label>
                <select
                  id="lp-zoom"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={String(zoom)}
                  onChange={(event) => setZoom(event.target.value === 'fit' ? 'fit' : (Number(event.target.value) as 0.5 | 0.75 | 1))}
                >
                  <option value="fit">Prilagodi širini</option>
                  <option value="0.5">50%</option>
                  <option value="0.75">75%</option>
                  <option value="1">100% (stvarna veličina)</option>
                </select>
                <button
                  type="button"
                  onClick={resetSettings}
                  className="mt-3 w-full px-3 py-2 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={13} /> Vrati zadane postavke (Avery L7160)
                </button>
                <p className="text-xs text-gray-400 mt-2">Postavke se automatski pamte na ovom uređaju.</p>
              </section>

              {layout.warnings.length > 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1" role="alert">
                  {layout.warnings.map((warning) => (
                    <p key={warning} className="flex gap-1.5">
                      <AlertTriangle size={13} className="shrink-0 mt-px" /> {warning}
                    </p>
                  ))}
                </div>
              ) : null}
              {hasErrors ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 space-y-1" role="alert">
                  {layout.errors.map((error) => (
                    <p key={error} className="flex gap-1.5">
                      <AlertTriangle size={13} className="shrink-0 mt-px" /> {error}
                    </p>
                  ))}
                </div>
              ) : null}
            </aside>

            <div ref={previewRef} className="flex-1 overflow-auto bg-slate-200 p-4 print:p-0 print:bg-white print:overflow-visible">
              {items.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-10 print:hidden">Nema odabrane opreme za naljepnice.</p>
              ) : (
                <div className="flex flex-col items-center gap-6 print:gap-0">
                  {pages.map((pageCells, pageIndex) => (
                    <div key={pageIndex} className="label-sheet-scale shrink-0" style={{ width: sheetPxWidth * scale, height: sheetPxHeight * scale }}>
                      <div
                        className={`label-sheet bg-white shadow-lg print:shadow-none ${pageIndex === pages.length - 1 ? 'label-sheet-last' : ''}`}
                        style={{
                          width: `${layout.pageWidthMm}mm`,
                          height: `${layout.pageHeightMm}mm`,
                          padding: `${settings.marginTopMm}mm ${settings.marginRightMm}mm ${settings.marginBottomMm}mm ${settings.marginLeftMm}mm`,
                          display: 'grid',
                          gridTemplateColumns: `repeat(${Math.max(1, Math.floor(settings.columns))}, ${layout.labelWidthMm}mm)`,
                          gridTemplateRows: `repeat(${Math.max(1, Math.floor(settings.rows))}, ${layout.labelHeightMm}mm)`,
                          columnGap: `${settings.gapXMm}mm`,
                          rowGap: `${settings.gapYMm}mm`,
                          transform: `scale(${scale})`,
                          transformOrigin: 'top left',
                        }}
                      >
                        {pageCells.map((cell, cellIndex) => {
                          const isFirstPage = pageIndex === 0;
                          const clickable = pickStartMode && isFirstPage;
                          return (
                            <div
                              key={cellIndex}
                              role={clickable ? 'button' : undefined}
                              tabIndex={clickable ? 0 : undefined}
                              title={clickable ? `Počni štampu od polja ${cellIndex + 1}` : undefined}
                              onClick={clickable ? () => { patchSettings({ startOffset: cellIndex }); setPickStartMode(false); } : undefined}
                              onKeyDown={
                                clickable
                                  ? (event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        patchSettings({ startOffset: cellIndex });
                                        setPickStartMode(false);
                                      }
                                    }
                                  : undefined
                              }
                              className={`label-cell overflow-hidden ${clickable ? 'cursor-pointer hover:bg-blue-50' : ''} ${
                                cell === null && isFirstPage && cellIndex < startOffset ? 'bg-slate-100' : ''
                              }`}
                              style={{ border: '0.25mm dashed #cbd5e1' }}
                            >
                              {cell ? (
                                renderLabelContent(cell)
                              ) : isFirstPage && cellIndex < startOffset ? (
                                <span className="print:hidden flex items-center justify-center h-full text-[10px] text-gray-400">
                                  preskočeno {cellIndex + 1}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media print {
          @page { size: A4 ${settings.orientation}; margin: 0; }
          body * { visibility: hidden; }
          .label-print-root, .label-print-root * { visibility: visible; }
          .label-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          .label-sheet-scale { width: auto !important; height: auto !important; }
          .label-sheet { transform: none !important; page-break-after: always; break-after: page; }
          .label-sheet-last { page-break-after: auto !important; break-after: auto !important; }
          .guides-off .label-cell { border-color: transparent !important; }
        }
      `}</style>
    </ModalRoot>
  );
};
