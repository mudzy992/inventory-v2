import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Package, Plus, Search } from 'lucide-react';
import { fetchWarehouseStockLotsApi } from '../../api/warehouse-stock-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { formatDate } from '../../helpers';
import { getStockLotStatusLabel } from '../../helpers/warehouse-stock.util';
import { getParentCategories, getSubCategories } from '../../store';
import type { WarehouseStockLot } from '../../types';
import { useStore } from '../../useStore';
import { Button } from '../ui/button';
import { inputClass } from '../ui/form-styles';
import { InventoryFreezeActionHint } from '../inventory-count/inventory-freeze-action-hint';

type BrowseLevel = 'parents' | 'subcategories' | 'lots';

interface WarehouseStockBrowsePanelProps {
  warehouseId: string;
  canReceive: boolean;
  onOpenReceive: () => void;
}

export const WarehouseStockBrowsePanel = ({
  warehouseId,
  canReceive,
  onOpenReceive,
}: WarehouseStockBrowsePanelProps) => {
  const [state] = useStore();
  const { toastError } = useToast();
  const [lots, setLots] = useState<WarehouseStockLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<BrowseLevel>('parents');
  const [parentId, setParentId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const assetParents = useMemo(
    () =>
      getParentCategories().filter((row) => (row.categoryKind ?? 'ASSET') === 'ASSET'),
    [state.categories],
  );

  const loadLots = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchWarehouseStockLotsApi(warehouseId);
      setLots(rows);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju');
    } finally {
      setLoading(false);
    }
  }, [toastError, warehouseId]);

  useEffect(() => {
    void loadLots();
  }, [loadLots]);

  const lotsForSubcategory = useMemo(() => {
    if (!subCategoryId) {
      return [];
    }
    const term = search.trim().toLowerCase();
    return lots.filter((lot) => {
      if (lot.categoryId !== subCategoryId) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        lot.productName.toLowerCase().includes(term) ||
        (lot.categoryName?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [lots, search, subCategoryId]);

  const parentStats = useMemo(() => {
    const map = new Map<string, { lotCount: number; qty: number }>();
    for (const lot of lots) {
      const category = state.categories.find((row) => row.id === lot.categoryId);
      const rootId = category?.parentId ?? lot.categoryId;
      const existing = map.get(rootId) ?? { lotCount: 0, qty: 0 };
      existing.lotCount += 1;
      existing.qty += lot.quantityOnHand;
      map.set(rootId, existing);
    }
    return map;
  }, [lots, state.categories]);

  const subStats = useMemo(() => {
    if (!parentId) {
      return new Map<string, { lotCount: number; qty: number }>();
    }
    const map = new Map<string, { lotCount: number; qty: number }>();
    for (const lot of lots) {
      if (lot.categoryId === parentId) {
        continue;
      }
      const category = state.categories.find((row) => row.id === lot.categoryId);
      if (category?.parentId !== parentId) {
        continue;
      }
      const existing = map.get(lot.categoryId) ?? { lotCount: 0, qty: 0 };
      existing.lotCount += 1;
      existing.qty += lot.quantityOnHand;
      map.set(lot.categoryId, existing);
    }
    return map;
  }, [lots, parentId, state.categories]);

  const parent = parentId ? state.categories.find((row) => row.id === parentId) : null;
  const subCategory = subCategoryId
    ? state.categories.find((row) => row.id === subCategoryId)
    : null;

  return (
    <div className="space-y-4">
      <InventoryFreezeActionHint />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 text-sm text-gray-600">
          <button type="button" className="hover:text-gray-900" onClick={() => {
            setLevel('parents');
            setParentId(null);
            setSubCategoryId(null);
            setSearch('');
          }}>
            Kategorije
          </button>
          {parent ? (
            <>
              <ChevronRight size={14} />
              <button
                type="button"
                className="hover:text-gray-900"
                onClick={() => {
                  setLevel('subcategories');
                  setSubCategoryId(null);
                  setSearch('');
                }}
              >
                {parent.name}
              </button>
            </>
          ) : null}
          {subCategory ? (
            <>
              <ChevronRight size={14} />
              <span className="font-medium text-gray-900">{subCategory.name}</span>
            </>
          ) : null}
        </div>
        {canReceive ? (
          <Button onClick={onOpenReceive}>
            <Plus size={14} />
            Prijem robe
          </Button>
        ) : null}
      </div>

      {level === 'parents' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assetParents.map((row) => {
            const stats = parentStats.get(row.id);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setParentId(row.id);
                  setLevel('subcategories');
                }}
                className="text-left bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3">
                  <Package size={20} className="text-blue-500 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">{row.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {getSubCategories(row.id).length} podkategorija
                      {stats ? ` · ${stats.lotCount} lotova · ${stats.qty} kom` : ''}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
          {assetParents.length === 0 ? (
            <p className="text-sm text-gray-400 col-span-full">Nema kategorija opreme.</p>
          ) : null}
        </div>
      ) : null}

      {level === 'subcategories' && parentId ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {getSubCategories(parentId).map((row) => {
            const stats = subStats.get(row.id);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setSubCategoryId(row.id);
                  setLevel('lots');
                }}
                className="text-left bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:shadow-sm transition-all"
              >
                <h3 className="font-medium text-gray-900">{row.name}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {stats ? `${stats.lotCount} lotova · ${stats.qty} kom na skladištu` : 'Nema lotova'}
                </p>
              </button>
            );
          })}
          {getSubCategories(parentId).length === 0 ? (
            <p className="text-sm text-gray-400 col-span-full">Nema podkategorija.</p>
          ) : null}
        </div>
      ) : null}

      {level === 'lots' && subCategoryId ? (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pretraži po nazivu…"
              className={`${inputClass} pl-9`}
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Naziv robe</th>
                  <th className="text-left px-4 py-2">Količina</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Ulaz</th>
                  <th className="text-left px-4 py-2">Ugovor</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      Učitavanje…
                    </td>
                  </tr>
                ) : null}
                {!loading &&
                  lotsForSubcategory.map((lot) => (
                    <tr key={lot.id} className="border-t">
                      <td className="px-4 py-2 font-medium">{lot.productName}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {lot.quantityOnHand}/{lot.quantityReceived}
                      </td>
                      <td className="px-4 py-2">{getStockLotStatusLabel(lot.status)}</td>
                      <td className="px-4 py-2">{formatDate(lot.entryDate)}</td>
                      <td className="px-4 py-2">{lot.contractNumber ?? '—'}</td>
                    </tr>
                  ))}
                {!loading && lotsForSubcategory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      Nema lotova u ovoj podkategoriji.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};
