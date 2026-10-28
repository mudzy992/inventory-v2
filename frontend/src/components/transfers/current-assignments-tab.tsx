import { useCallback, useState } from 'react';
import { useStore } from '../../useStore';
import { fetchEquipmentPageApi } from '../../api/equipment-api';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { getEmployeeFullName, getOrgUnitPath } from '../../helpers';
import { getSerialNumberDisplay } from '../../helpers/equipment-display.util';
import { isAdmin, isEvidenticar, isModerator } from '../../store';
import { Search } from 'lucide-react';
import { ResponsiveTable } from '../ui/responsive-table';
import { PaginationControls } from '../ui/pagination-controls';
import { EquipmentCard } from '../EquipmentCard';
import type { Equipment } from '../../types';
import { onKeyboardActivate } from '../../utils/keyboard-activation';

const categoryBadgeClass = 'inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600';

export const CurrentAssignmentsTab = () => {
  const [state] = useStore();
  const [viewEquipmentId, setViewEquipmentId] = useState<string | null>(null);
  const canManage = isAdmin() || isEvidenticar() || isModerator();

  const fetchPage = useCallback(
    (params: { page?: number; pageSize?: number; search?: string }) =>
      fetchEquipmentPageApi({ ...params, status: 'zaduzeno' }),
    [],
  );

  const list = usePaginatedList<Equipment, Record<string, never>>({
    fetchPage,
    initialSortBy: 'inventoryNumber',
    initialSortDir: 'asc',
  });

  const renderRowContent = (eq: Equipment) => {
    const holder = eq.currentHolder;
    const cat = state.categories.find((c) => c.id === eq.categoryId);
    const serial = getSerialNumberDisplay(cat, eq.specifications);
    return { holder, cat, serial };
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Pregled trenutno zadužene opreme u vašem opsegu — uključuje i zaduženja bez prenosnice
        (direktno izdavanje iz lota). Kliknite na red za detalje opreme.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
            placeholder="Pretraži po inv. broju, lotu, radniku..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      <ResponsiveTable
        isEmpty={!list.isLoading && list.items.length === 0}
        emptyMessage={list.isLoading ? 'Učitavanje…' : 'Nema trenutnih zaduženja u opsegu'}
        mobile={list.items.map((eq) => {
          const { holder, cat, serial } = renderRowContent(eq);
          return (
            <button
              key={eq.id}
              type="button"
              onClick={() => setViewEquipmentId(eq.id)}
              className="w-full text-left p-4 space-y-1.5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-800">{eq.stockLot?.productName ?? '—'}</p>
                {cat ? <span className={categoryBadgeClass}>{cat.name}</span> : null}
              </div>
              <p className="font-mono text-xs font-semibold text-blue-700">{eq.inventoryNumber}</p>
              {serial ? <p className="text-xs text-gray-500">{serial.label}: {serial.value}</p> : null}
              {holder ? (
                <p className="text-xs text-gray-700">
                  {getEmployeeFullName(holder)}
                  <span className="block text-gray-400">
                    {getOrgUnitPath(state.orgUnits, holder.orgUnitId)}
                  </span>
                </p>
              ) : null}
            </button>
          );
        })}
        desktop={
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-2.5 font-medium text-gray-600">Inv. broj</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Naziv lota</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Serijski</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Kategorija</th>
                <th className="px-4 py-2.5 font-medium text-gray-600">Zadužen na</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((eq) => {
                const { holder, cat, serial } = renderRowContent(eq);
                return (
                  <tr
                    key={eq.id}
                    className="border-t border-gray-50 hover:bg-blue-50/50 transition-colors cursor-pointer"
                    onClick={() => setViewEquipmentId(eq.id)}
                    onKeyDown={onKeyboardActivate(() => setViewEquipmentId(eq.id))}
                    tabIndex={0}
                    aria-label={`Prikaži opremu ${eq.inventoryNumber ?? eq.id}`}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">
                      {eq.inventoryNumber}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-800">{eq.stockLot?.productName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{serial?.value ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {cat ? <span className={categoryBadgeClass}>{cat.name}</span> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-700">
                      {holder ? (
                        <>
                          <span className="font-medium">{getEmployeeFullName(holder)}</span>
                          <span className="block text-gray-400">
                            {getOrgUnitPath(state.orgUnits, holder.orgUnitId)}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
      />

      {list.meta ? (
        <PaginationControls
          page={list.page}
          pageSize={list.pageSize}
          total={list.meta.total}
          totalPages={list.meta.totalPages}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          className="mt-4 rounded-xl border border-gray-100"
        />
      ) : null}

      {viewEquipmentId ? (
        <EquipmentCard
          equipmentId={viewEquipmentId}
          onClose={() => setViewEquipmentId(null)}
          showTransferActions={canManage}
        />
      ) : null}
    </div>
  );
};
