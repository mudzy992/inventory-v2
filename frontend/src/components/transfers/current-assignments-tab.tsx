import { useCallback } from 'react';
import { useStore } from '../../useStore';
import { fetchEquipmentPageApi } from '../../api/equipment-api';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { getEmployeeFullName, getOrgUnitPath } from '../../helpers';
import { Search } from 'lucide-react';
import { ResponsiveTable } from '../ui/responsive-table';
import { PaginationControls } from '../ui/pagination-controls';
import type { Equipment } from '../../types';

export const CurrentAssignmentsTab = () => {
  const [state] = useStore();

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

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Pregled trenutno zadužene opreme u vašem opsegu — uključuje i zaduženja bez prenosnice
        (direktno izdavanje iz lota).
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
          const holder = eq.currentHolder;
          const cat = state.categories.find((c) => c.id === eq.categoryId);
          return (
            <div key={eq.id} className="p-4 space-y-1">
              <p className="text-sm font-medium text-gray-800">{eq.stockLot?.productName ?? '—'}</p>
              <p className="font-mono text-xs text-gray-600">{eq.inventoryNumber}</p>
              <p className="text-xs text-gray-500">{cat?.name}</p>
              {holder ? (
                <p className="text-xs text-gray-700">
                  {getEmployeeFullName(holder)}
                  <span className="text-gray-400">
                    {' · '}
                    {getOrgUnitPath(state.orgUnits, holder.orgUnitId)}
                  </span>
                </p>
              ) : null}
            </div>
          );
        })}
        desktop={
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Naziv lota</th>
                <th className="px-4 py-3 font-medium text-gray-600">Inv. broj</th>
                <th className="px-4 py-3 font-medium text-gray-600">Kategorija</th>
                <th className="px-4 py-3 font-medium text-gray-600">Zadužen na</th>
                <th className="px-4 py-3 font-medium text-gray-600">Org. jedinica</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((eq) => {
                const holder = eq.currentHolder;
                const cat = state.categories.find((c) => c.id === eq.categoryId);
                return (
                  <tr key={eq.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-800">{eq.stockLot?.productName ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-800">{eq.inventoryNumber}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{cat?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {holder ? getEmployeeFullName(holder) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {holder ? getOrgUnitPath(state.orgUnits, holder.orgUnitId) : '—'}
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
    </div>
  );
};
