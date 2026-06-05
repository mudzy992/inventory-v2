import { useMemo } from 'react';
import { Printer, X } from 'lucide-react';
import type { InventoryPrintScopeDto } from '../../api/inventory-api';
import { getEmployeeFullName, getOrgUnitPath } from '../../helpers';
import { usePublicSettings } from '../../contexts/public-settings-context';
import { buildCompanyAddressLine, companyHeaderFromSettings } from '../../helpers/company-header.util';
import type { AppState } from '../../types';
import { Button } from '../ui/button';

interface InventoryPrintSheetProps {
  scope: InventoryPrintScopeDto;
  state: AppState;
  onClose: () => void;
}

interface PrintRow {
  inventoryNumber: string;
  name: string;
  quantity: number;
}

interface PrintGroup {
  key: string;
  title: string;
  subtitle?: string;
  rows: PrintRow[];
}

interface PrintPageBlock {
  groupTitle: string;
  groupSubtitle?: string;
  rows: PrintRow[];
  showGroupHeader: boolean;
}

interface PrintPage {
  pageNumber: number;
  blocks: PrintPageBlock[];
}

const ROWS_PER_PAGE = 18;

const buildEquipmentName = (
  state: AppState,
  item: InventoryPrintScopeDto['equipment'][number],
): string => {
  const category = item.category?.name ?? state.categories.find((row) => row.id === item.categoryId)?.name ?? '';
  const spec = Object.values(item.specifications ?? {})
    .filter(Boolean)
    .slice(0, 2)
    .join(', ');
  return [category, spec].filter(Boolean).join(' — ');
};

const paginateGroups = (groups: PrintGroup[]): PrintPage[] => {
  const pages: PrintPage[] = [];
  let currentPage: PrintPage = { pageNumber: 1, blocks: [] };
  let rowsOnPage = 0;
  const pushPage = () => {
    if (currentPage.blocks.length > 0) {
      pages.push(currentPage);
    }
    currentPage = { pageNumber: pages.length + 1, blocks: [] };
    rowsOnPage = 0;
  };
  for (const group of groups) {
    let rowIndex = 0;
    while (rowIndex < group.rows.length) {
      if (rowsOnPage >= ROWS_PER_PAGE) {
        pushPage();
      }
      const remaining = ROWS_PER_PAGE - rowsOnPage;
      const chunk = group.rows.slice(rowIndex, rowIndex + remaining);
      currentPage.blocks.push({
        groupTitle: group.title,
        groupSubtitle: group.subtitle,
        rows: chunk,
        showGroupHeader: rowIndex === 0,
      });
      rowIndex += chunk.length;
      rowsOnPage += chunk.length;
    }
  }
  if (currentPage.blocks.length > 0) {
    pages.push(currentPage);
  }
  return pages.length > 0 ? pages : [{ pageNumber: 1, blocks: [] }];
};

export const InventoryPrintSheet = ({ scope, state, onClose }: InventoryPrintSheetProps) => {
  const { settings } = usePublicSettings();
  const company = companyHeaderFromSettings(settings);
  const companyLine = buildCompanyAddressLine(company);
  const { committee, equipment } = scope;
  const categoryLabels = committee.category?.name ?? '';
  const year = committee.session?.year ?? new Date().getFullYear();
  const cityLabel =
    committee.session?.orgUnit?.effectiveLocationCity?.name ??
    committee.session?.orgUnit?.effectiveLocationCityId ??
    '—';
  const groups = useMemo(() => {
    const byHolder = new Map<string, PrintGroup>();
    const warehouseGroup: PrintGroup = {
      key: 'warehouse',
      title: 'Skladište',
      rows: [],
    };
    for (const item of equipment) {
      const row: PrintRow = {
        inventoryNumber: item.inventoryNumber,
        name: buildEquipmentName(state, item),
        quantity: 1,
      };
      if (item.currentHolder) {
        const holderId = item.currentHolder.id;
        const existing = byHolder.get(holderId);
        const subtitle = getOrgUnitPath(state.orgUnits, item.currentHolder.orgUnitId);
        if (existing) {
          existing.rows.push(row);
        } else {
          byHolder.set(holderId, {
            key: holderId,
            title: getEmployeeFullName(item.currentHolder),
            subtitle,
            rows: [row],
          });
        }
      } else if (item.warehouse) {
        warehouseGroup.rows.push(row);
      }
    }
    const result = [...byHolder.values()].sort((a, b) => a.title.localeCompare(b.title));
    if (warehouseGroup.rows.length > 0) {
      result.push(warehouseGroup);
    }
    return result;
  }, [equipment, state]);
  const pages = useMemo(() => paginateGroups(groups), [groups]);
  const totalPages = pages.length;
  const president = committee.members.find((member) => member.role === 'predsjednik');
  const clerks = committee.members.filter((member) => member.role === 'clan');
  const handlePrint = () => {
    window.print();
  };
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-start justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl print:shadow-none print:max-w-none">
        <div className="p-4 border-b flex justify-between items-center print:hidden">
          <h2 className="font-semibold text-gray-900">Popisna lista</h2>
          <div className="flex gap-2">
            <Button onClick={handlePrint}>
              <Printer size={14} />
              Štampaj
            </Button>
            <button type="button" onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700" aria-label="Zatvori">
              <X size={18} />
            </button>
          </div>
        </div>
        <div id="inventory-print-root" className="p-6 text-sm text-gray-900">
          {pages.map((page) => (
            <div key={page.pageNumber} className="inventory-print-page mb-8">
              <header className="border-b border-gray-300 pb-3 mb-4">
                {company.name ? (
                  <div className="mb-2 text-center">
                    <p className="text-sm font-bold text-gray-900">{company.name}</p>
                    {companyLine ? <p className="text-xs text-gray-500">{companyLine}</p> : null}
                  </div>
                ) : null}
                <h1 className="text-lg font-bold">{committee.name}</h1>
                <p className="text-gray-600 mt-1">
                  Grad: {cityLabel} · Godina: {year}
                </p>
                <p className="text-gray-600">Popisuje se: {categoryLabels || '—'}</p>
              </header>
              {page.blocks.map((block, blockIndex) => (
                <section
                  key={`${page.pageNumber}-${block.groupTitle}-${blockIndex}`}
                  className="mb-6 break-inside-avoid"
                >
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
                        <tr key={row.inventoryNumber}>
                          <td className="border border-gray-300 px-2 py-1 font-mono">{row.inventoryNumber}</td>
                          <td className="border border-gray-300 px-2 py-1">{row.name}</td>
                          <td className="border border-gray-300 px-2 py-1 text-center">{row.quantity}</td>
                          <td className="border border-gray-300 px-2 py-1" />
                          <td className="border border-gray-300 px-2 py-1" />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
              {page.pageNumber === totalPages ? (
                <footer className="inventory-print-footer mt-8 pt-4 border-t border-gray-300">
                  <p className="text-xs text-gray-500 mb-4">Potpisi komisije:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div>
                      <p className="text-xs font-medium">Predsjednik</p>
                      <p className="text-xs text-gray-600 mb-6">
                        {president?.employee
                          ? getEmployeeFullName(president.employee)
                          : president?.employeeId}
                      </p>
                      <div className="border-b border-gray-400 h-8" />
                    </div>
                    {clerks.map((member) => (
                      <div key={member.employeeId}>
                        <p className="text-xs font-medium">Član komisije</p>
                        <p className="text-xs text-gray-600 mb-6">
                          {member.employee ? getEmployeeFullName(member.employee) : member.employeeId}
                        </p>
                        <div className="border-b border-gray-400 h-8" />
                      </div>
                    ))}
                  </div>
                </footer>
              ) : null}
              <p className="text-xs text-gray-400 text-right mt-6">
                Stranica {page.pageNumber} / {totalPages}
              </p>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #inventory-print-root, #inventory-print-root * { visibility: visible; }
          #inventory-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
          .inventory-print-page { page-break-after: always; }
          .inventory-print-page:last-child { page-break-after: auto; }
          @page { margin: 15mm; }
        }
      `}</style>
    </div>
  );
};
