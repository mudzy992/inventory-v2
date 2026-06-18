import { useMemo } from 'react';
import { Download, Printer, X } from 'lucide-react';
import type { InventoryPrintScopeDto } from '../../api/inventory-api';
import { usePublicSettings } from '../../contexts/public-settings-context';
import { buildCompanyAddressLine, companyHeaderFromSettings } from '../../helpers/company-header.util';
import type { AppState } from '../../types';
import { Button } from '../ui/button';
import { ModalRoot } from '../ui/modal-root';
import { MODAL_Z } from '../../constants/modal-z-index';
import {
  buildInventoryPrintHtml,
  buildInventoryPrintPages,
  downloadInventoryPrintPdf,
  openInventoryPrintWindow,
  type InventoryPrintPageBlock,
} from './inventory-print-document.util';

interface InventoryPrintSheetProps {
  scope: InventoryPrintScopeDto;
  state: AppState;
  onClose: () => void;
}

const PrintPageFooter = () => (
  <footer className="inventory-print-footer mt-3 pt-2 border-t border-gray-300">
    <p className="text-xs text-gray-500 mb-1.5">Potpisi komisije:</p>
    <div className="space-y-2">
      <div className="border-b border-gray-400 h-4" />
      <div className="border-b border-gray-400 h-4" />
      <div className="border-b border-gray-400 h-4" />
    </div>
  </footer>
);

const PrintPageBlockSection = ({ block }: { block: InventoryPrintPageBlock }) => (
  <section className="mb-6 break-inside-avoid">
    {block.showGroupHeader ? (
      <>
        <h2 className="font-semibold text-gray-800 border-b border-gray-200 pb-1 mb-2">
          {block.groupTitle}
        </h2>
        {block.groupSubtitle ? (
          <p className="text-xs text-gray-500 mb-2">{block.groupSubtitle}</p>
        ) : null}
      </>
    ) : (
      <p className="text-xs text-gray-500 mb-2 italic">Nastavak: {block.groupTitle}</p>
    )}
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-gray-50">
          <th className="border border-gray-300 px-2 py-1 text-left w-28">Inv. broj</th>
          <th className="border border-gray-300 px-2 py-1 text-left">Naziv opreme</th>
          <th className="border border-gray-300 px-2 py-1 text-center w-12">Kol.</th>
          <th className="border border-gray-300 px-2 py-1 text-left w-24">Potpis</th>
          <th className="border border-gray-300 px-2 py-1 text-left w-32">Napomena</th>
        </tr>
      </thead>
      <tbody>
        {block.rows.map((row) => (
          <tr key={`${block.groupTitle}-${row.inventoryNumber}`}>
            <td className="border border-gray-300 px-2 py-1 font-mono">{row.inventoryNumber}</td>
            <td className="border border-gray-300 px-2 py-1">{row.name}</td>
            <td className="border border-gray-300 px-2 py-1 text-center" />
            <td className="border border-gray-300 px-2 py-1" />
            <td className="border border-gray-300 px-2 py-1" />
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

export const InventoryPrintSheet = ({ scope, state, onClose }: InventoryPrintSheetProps) => {
  const { settings } = usePublicSettings();
  const company = companyHeaderFromSettings(settings);
  const companyLine = buildCompanyAddressLine(company);
  const { committee } = scope;
  const categoryLabels = committee.category?.name ?? '';
  const warehouseLabel = committee.warehouse?.name ?? '';
  const documentInput = useMemo(
    () => ({ scope, state, company, companyLine }),
    [scope, state, company, companyLine],
  );
  const pages = useMemo(() => buildInventoryPrintPages(documentInput), [documentInput]);
  const totalPages = pages.length;
  const handlePrint = () => {
    openInventoryPrintWindow(buildInventoryPrintHtml(documentInput));
  };
  const handleDownloadPdf = () => {
    downloadInventoryPrintPdf(documentInput);
  };
  return (
    <ModalRoot
      open
      onClose={onClose}
      zIndex={MODAL_Z.destructive}
      size="full"
      panelClassName="max-w-4xl"
      enableEscape
      closeOnBackdrop
    >
      <div className="bg-white rounded-xl shadow-xl w-full">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-semibold text-gray-900">Popisna lista</h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleDownloadPdf}>
              <Download size={14} />
              Preuzmi PDF
            </Button>
            <Button onClick={handlePrint}>
              <Printer size={14} />
              Štampaj
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700"
              aria-label="Zatvori"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="p-6 text-sm text-gray-900 max-h-[70vh] overflow-y-auto">
          {pages.map((page) => (
            <div key={page.pageNumber} className="inventory-print-page mb-8 flex flex-col">
              <header className="border-b border-gray-300 pb-3 mb-4">
                {company.name ? (
                  <div className="mb-2 text-center">
                    <p className="text-sm font-bold text-gray-900">{company.name}</p>
                    {companyLine ? <p className="text-xs text-gray-500">{companyLine}</p> : null}
                  </div>
                ) : null}
                <h1 className="text-lg font-bold">
                  {committee.name ?? `Popis — ${warehouseLabel || categoryLabels}`}
                </h1>
                {warehouseLabel ? <p className="text-gray-600 mt-1">Skladište: {warehouseLabel}</p> : null}
                <p className="text-gray-600">Popisuje se: {categoryLabels || '—'}</p>
              </header>
              <div className="flex-1">
                {page.blocks.map((block, blockIndex) => (
                  <PrintPageBlockSection
                    key={`${page.pageNumber}-${block.groupTitle}-${blockIndex}`}
                    block={block}
                  />
                ))}
              </div>
              <PrintPageFooter />
              <p className="text-xs text-gray-400 text-right mt-3">
                Stranica {page.pageNumber} / {totalPages}
              </p>
            </div>
          ))}
        </div>
      </div>
    </ModalRoot>
  );
};
