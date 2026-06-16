import { QRCodeSVG } from 'qrcode.react';
import type { Category, Equipment } from '../types';
import {
  buildEquipmentDisplayName,
  buildEquipmentQrUrl,
  getUniqueFieldsDisplay,
} from '../helpers/equipment-display.util';
import { ModalRoot } from './ui/modal-root';
import { MODAL_Z } from '../constants/modal-z-index';

interface LabelPrintSheetProps {
  items: Equipment[];
  categories: Category[];
  onClose: () => void;
}

export const LabelPrintSheet = ({ items, categories, onClose }: LabelPrintSheetProps) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <ModalRoot open onClose={onClose} zIndex={MODAL_Z.destructive} size="full" panelClassName="max-w-4xl print:max-w-none" enableEscape closeOnBackdrop>
      <div className="bg-white rounded-xl shadow-xl w-full print:shadow-none label-print-root">
        <div className="p-4 border-b flex justify-between items-center print:hidden">
          <h2 className="font-semibold">Štampa naljepnica ({items.length})</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
            >
              Štampaj
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">
              Zatvori
            </button>
          </div>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 print:grid-cols-2 print:gap-3 max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible">
          {items.map((item) => {
            const category = categories.find((row) => row.id === item.categoryId);
            const qrData = buildEquipmentQrUrl(item);
            const displayName = buildEquipmentDisplayName(category, item.specifications);
            const uniqueFields = getUniqueFieldsDisplay(category, item.specifications);
            return (
              <div
                key={item.id}
                className="label-card border border-gray-300 rounded-lg p-3 flex flex-row items-stretch gap-3 break-inside-avoid min-h-[108px]"
              >
                <div className="shrink-0 flex items-center justify-center">
                  <QRCodeSVG value={qrData} size={88} />
                </div>
                <div className="flex-1 min-w-0 text-left flex flex-col justify-center">
                  <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-tight">
                    {displayName || category?.name}
                  </p>
                  {uniqueFields.map((uniqueField) => (
                    <p key={uniqueField.label} className="text-[10px] text-gray-700 mt-1 truncate">
                      <span className="text-gray-500">{uniqueField.label}:</span> {uniqueField.value}
                    </p>
                  ))}
                  <p className="font-mono text-[11px] font-bold text-gray-900 mt-1">
                    {item.inventoryNumber}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">{category?.name ?? ''}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .label-print-root, .label-print-root * { visibility: visible; }
          .label-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          .label-card { page-break-inside: avoid; }
        }
      `}</style>
    </ModalRoot>
  );
};
