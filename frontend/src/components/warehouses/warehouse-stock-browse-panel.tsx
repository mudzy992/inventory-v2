import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { fetchWarehouseStockLotsPageApi } from '../../api/warehouse-stock-api';
import { fetchAllPaginatedItems } from '../../api/fetch-all-paginated';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { formatDate } from '../../helpers';
import {
  buildParentCategoryStats,
  buildSubCategoryStats,
} from '../../helpers/category-browse-stats.util';
import { getStockLotStatusLabel } from '../../helpers/warehouse-stock.util';
import { getParentCategories, getSubCategories } from '../../store';
import type { WarehouseStockLot } from '../../types';
import { useStore } from '../../useStore';
import { CategoryBrowseBreadcrumb } from '../shared/category-browse/category-browse-breadcrumb';
import { CategoryParentGrid } from '../shared/category-browse/category-parent-grid';
import { CategorySubGrid } from '../shared/category-browse/category-sub-grid';
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
      const rows = await fetchAllPaginatedItems((params) =>
        fetchWarehouseStockLotsPageApi(warehouseId, params),
      );
      setLots(rows);
    } catch (err) {
      setLots([]);
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

  const parentStats = useMemo(
    () => buildParentCategoryStats(lots, state.categories, (lot) => lot.quantityOnHand),
    [lots, state.categories],
  );

  const subStats = useMemo(() => {
    if (!parentId) {
      return new Map();
    }
    return buildSubCategoryStats(lots, state.categories, parentId, (lot) => lot.quantityOnHand);
  }, [lots, parentId, state.categories]);

  const parent = parentId ? state.categories.find((row) => row.id === parentId) : null;
  const subCategory = subCategoryId
    ? state.categories.find((row) => row.id === subCategoryId)
    : null;

  const handleNavigateRoot = () => {
    setLevel('parents');
    setParentId(null);
    setSubCategoryId(null);
    setSearch('');
  };

  const handleNavigateParent = () => {
    setLevel('subcategories');
    setSubCategoryId(null);
    setSearch('');
  };

  return (
    <div className="space-y-4">
      <InventoryFreezeActionHint />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CategoryBrowseBreadcrumb
          parent={parent}
          subCategory={subCategory}
          onNavigateRoot={handleNavigateRoot}
          onNavigateParent={handleNavigateParent}
        />
        {canReceive ? (
          <Button onClick={onOpenReceive}>
            <Plus size={14} />
            Prijem robe
          </Button>
        ) : null}
      </div>

      {level === 'parents' ? (
        <CategoryParentGrid
          parents={assetParents}
          stats={parentStats}
          getSubCategoryCount={(id) => getSubCategories(id).length}
          onSelect={(id) => {
            setParentId(id);
            setLevel('subcategories');
          }}
          emptyMessage="Nema kategorija opreme."
        />
      ) : null}

      {level === 'subcategories' && parentId ? (
        <CategorySubGrid
          subCategories={getSubCategories(parentId)}
          stats={subStats}
          onSelect={(id) => {
            setSubCategoryId(id);
            setLevel('lots');
          }}
        />
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
