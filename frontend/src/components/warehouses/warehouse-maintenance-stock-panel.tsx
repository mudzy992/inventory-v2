import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  fetchMaintenanceStockLotsApi,
  receiveMaintenanceStockLotApi,
  type MaintenanceStockLotDto,
} from '../../api/maintenance-parts-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { usePublicSettings } from '../../contexts/public-settings-context';
import { formatDate } from '../../helpers';
import { buildLegacySpecsPayload } from '../../helpers/category-lot-spec-fields.util';
import {
  buildParentCategoryStats,
  buildSubCategoryStats,
} from '../../helpers/category-browse-stats.util';
import { getLeafCategories } from '../../helpers/warehouse-stock.util';
import { getParentCategories, getSubCategories } from '../../store';
import { useStore } from '../../useStore';
import type { Category } from '../../types';
import { CategoryLotSpecFields } from '../maintenance-parts/category-lot-spec-fields';
import { WarehouseMaintenanceConsumptionPanel } from '../maintenance-parts/warehouse-maintenance-consumption-panel';
import { CategoryBrowseBreadcrumb } from '../shared/category-browse/category-browse-breadcrumb';
import { CategoryParentGrid } from '../shared/category-browse/category-parent-grid';
import { CategorySubGrid } from '../shared/category-browse/category-sub-grid';
import { Button } from '../ui/button';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';
import { InventoryFreezeActionHint, useInventoryFreezeActive } from '../inventory-count/inventory-freeze-action-hint';

type BrowseLevel = 'parents' | 'subcategories' | 'lots';

interface WarehouseMaintenanceStockPanelProps {
  warehouseId: string;
  canReceive: boolean;
}

export const WarehouseMaintenanceStockPanel = ({
  warehouseId,
  canReceive,
}: WarehouseMaintenanceStockPanelProps) => {
  const { getBoolean } = usePublicSettings();
  const maintenanceEnabled = getBoolean('features.maintenance_parts', true);
  const [state] = useStore();
  const { toastError, toastSuccess } = useToast();
  const isFrozen = useInventoryFreezeActive();
  const [lots, setLots] = useState<MaintenanceStockLotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReceive, setShowReceive] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [legacySpecValues, setLegacySpecValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [browseLevel, setBrowseLevel] = useState<BrowseLevel>('parents');
  const [parentId, setParentId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const leafMaintenanceCategories = getLeafCategories(state.categories).filter(
    (row) => row.categoryKind === 'MAINTENANCE',
  );
  const maintenanceParents = useMemo(
    () => getParentCategories().filter((row) => row.categoryKind === 'MAINTENANCE'),
    [state.categories],
  );
  const selectedCategory: Category | undefined = state.categories.find((row) => row.id === categoryId);
  const lotSpecFields = selectedCategory ? selectedCategory.optionalFields : [];
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
  const lotsForSubcategory = useMemo(() => {
    if (!subCategoryId) {
      return [];
    }
    return lots.filter((lot) => lot.categoryId === subCategoryId);
  }, [lots, subCategoryId]);
  const browseParent = parentId ? state.categories.find((row) => row.id === parentId) : null;
  const browseSubCategory = subCategoryId
    ? state.categories.find((row) => row.id === subCategoryId)
    : null;
  const loadLots = useCallback(async () => {
    if (!maintenanceEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchMaintenanceStockLotsApi(warehouseId);
      setLots(rows);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri učitavanju');
    } finally {
      setLoading(false);
    }
  }, [maintenanceEnabled, toastError, warehouseId]);
  useEffect(() => {
    void loadLots();
  }, [loadLots]);
  const handleNavigateRoot = () => {
    setBrowseLevel('parents');
    setParentId(null);
    setSubCategoryId(null);
  };
  const handleNavigateParent = () => {
    setBrowseLevel('subcategories');
    setSubCategoryId(null);
  };
  const handleReceive = async () => {
    if (!categoryId || !productName.trim() || !entryDate) {
      return;
    }
    const qty = Number.parseInt(quantity, 10);
    if (Number.isNaN(qty) || qty < 1) {
      return;
    }
    setSaving(true);
    try {
      const legacySpecs = buildLegacySpecsPayload(lotSpecFields, legacySpecValues);
      await receiveMaintenanceStockLotApi(warehouseId, {
        categoryId,
        productName: productName.trim(),
        quantity: qty,
        entryDate,
        legacySpecs: Object.keys(legacySpecs).length > 0 ? legacySpecs : undefined,
      });
      toastSuccess('Roba za održavanje evidentirana');
      setShowReceive(false);
      setProductName('');
      setQuantity('1');
      setCategoryId('');
      setLegacySpecValues({});
      await loadLots();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri prijemu');
    } finally {
      setSaving(false);
    }
  };
  if (!maintenanceEnabled) {
    return (
      <p className="text-sm text-gray-500">Modul opreme za održavanje je isključen u postavkama.</p>
    );
  }
  return (
    <div className="space-y-4">
      <InventoryFreezeActionHint />
      {canReceive && !isFrozen ? (
        <div>
          {!showReceive ? (
            <Button variant="secondary" onClick={() => setShowReceive(true)}>
              <Plus size={14} />
              Prijem robe za održavanje
            </Button>
          ) : (
            <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50">
              <div>
                <label className={labelClass}>Kategorija (održavanje)</label>
                <select
                  className={selectClass}
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setLegacySpecValues({});
                  }}
                >
                  <option value="">— Odaberi —</option>
                  {leafMaintenanceCategories.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Naziv artikla</label>
                <input aria-label="Naziv artikla"
                  className={inputClass}
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Količina</label>
                  <input aria-label="Količina"
                    type="number"
                    min={1}
                    className={inputClass}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Datum prijema</label>
                  <input aria-label="Datum prijema"
                    type="date"
                    className={inputClass}
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                  />
                </div>
              </div>
              <CategoryLotSpecFields
                category={selectedCategory}
                values={legacySpecValues}
                onChange={(fieldId, value) =>
                  setLegacySpecValues((prev) => ({ ...prev, [fieldId]: value }))
                }
              />
              <div className="flex gap-2">
                <Button disabled={saving} onClick={() => void handleReceive()}>
                  Evidentiraj
                </Button>
                <Button variant="secondary" onClick={() => setShowReceive(false)}>
                  Odustani
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {loading ? <p className="text-sm text-gray-500">Učitavanje...</p> : null}
      {!loading ? (
        <>
          <CategoryBrowseBreadcrumb
            parent={browseParent ?? null}
            subCategory={browseSubCategory ?? null}
            onNavigateRoot={handleNavigateRoot}
            onNavigateParent={handleNavigateParent}
          />
          {browseLevel === 'parents' ? (
            <CategoryParentGrid
              parents={maintenanceParents}
              stats={parentStats}
              getSubCategoryCount={(id) =>
                getSubCategories(id).filter((row) => row.categoryKind === 'MAINTENANCE').length
              }
              onSelect={(id) => {
                setParentId(id);
                setBrowseLevel('subcategories');
              }}
              emptyMessage="Nema kategorija održavanja."
              countLabel="lotova"
            />
          ) : null}
          {browseLevel === 'subcategories' && parentId ? (
            <CategorySubGrid
              subCategories={getSubCategories(parentId).filter(
                (row) => row.categoryKind === 'MAINTENANCE',
              )}
              stats={subStats}
              onSelect={(id) => {
                setSubCategoryId(id);
                setBrowseLevel('lots');
              }}
            />
          ) : null}
          {browseLevel === 'lots' && subCategoryId ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Artikal</th>
                    <th className="px-3 py-2">Kategorija</th>
                    <th className="px-3 py-2">Na stanju</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Prijem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lotsForSubcategory.map((lot) => (
                    <tr key={lot.id}>
                      <td className="px-3 py-2 font-medium text-gray-800">{lot.productName}</td>
                      <td className="px-3 py-2 text-gray-600">{lot.category?.name ?? '—'}</td>
                      <td className="px-3 py-2">{lot.quantityOnHand}</td>
                      <td className="px-3 py-2 text-gray-600">{lot.status}</td>
                      <td className="px-3 py-2 text-gray-500">{formatDate(lot.entryDate)}</td>
                    </tr>
                  ))}
                  {lotsForSubcategory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                        Nema lotova u ovoj podkategoriji.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
      <WarehouseMaintenanceConsumptionPanel warehouseId={warehouseId} />
    </div>
  );
};
