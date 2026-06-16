import { useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import type { EquipmentCatalogItem } from '../../api/equipment-catalog-api';
import type { StockLotReceivePreview } from '../../api/warehouse-stock-api';
import { bulkCreateStockLotsApi, fetchStockLotReceivePreviewApi } from '../../api/warehouse-stock-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { getAssetLeafCategories } from '../../helpers/warehouse-stock.util';
import { useStore } from '../../useStore';
import { CatalogItemAutocomplete } from '../catalog/catalog-item-autocomplete';
import { Button } from '../ui/button';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';
import {
  InventoryFreezeActionHint,
  useInventoryFreezeActive,
} from '../inventory-count/inventory-freeze-action-hint';

interface ReceiveLine {
  key: string;
  categoryId: string;
  catalogItem: EquipmentCatalogItem | null;
  quantity: string;
  entryDate: string;
  contractNumber: string;
  previewLoading: boolean;
  previewError: string | null;
  preview: StockLotReceivePreview | null;
}

const emptyLine = (): ReceiveLine => ({
  key: crypto.randomUUID(),
  categoryId: '',
  catalogItem: null,
  quantity: '1',
  entryDate: new Date().toISOString().slice(0, 10),
  contractNumber: '',
  previewLoading: false,
  previewError: null,
  preview: null,
});

interface WarehouseStockReceivePageProps {
  warehouseId: string;
  onBack: () => void;
  onSaved: () => void;
}

export const WarehouseStockReceivePage = ({
  warehouseId,
  onBack,
  onSaved,
}: WarehouseStockReceivePageProps) => {
  const [state] = useStore();
  const { toastError, toastSuccess } = useToast();
  const isFrozen = useInventoryFreezeActive();
  const leafCategories = getAssetLeafCategories(state.categories);
  const [lines, setLines] = useState<ReceiveLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const updateLine = (key: string, patch: Partial<ReceiveLine>) => {
    setLines((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleCatalogItemChange = async (key: string, item: EquipmentCatalogItem | null) => {
    updateLine(key, { catalogItem: item, preview: null, previewError: null });
    if (!item) {
      return;
    }
    updateLine(key, { previewLoading: true });
    try {
      const preview = await fetchStockLotReceivePreviewApi(warehouseId, item.id);
      updateLine(key, { preview, previewLoading: false });
    } catch (err) {
      updateLine(key, {
        previewLoading: false,
        previewError: err instanceof ApiError ? err.message : 'Greška pri provjeri postojećeg tipa robe',
      });
    }
  };

  const handleSave = async () => {
    const payload = lines.map((row) => ({
      categoryId: row.categoryId,
      catalogItemId: row.catalogItem?.id ?? '',
      quantity: Number.parseInt(row.quantity, 10),
      entryDate: row.entryDate,
      contractNumber: row.contractNumber.trim() || undefined,
    }));
    if (payload.some((row) => !row.categoryId || !row.catalogItemId || !row.entryDate)) {
      toastError('Svaka stavka mora imati kategoriju, šifrarnik i datum ulaza.');
      return;
    }
    if (payload.some((row) => Number.isNaN(row.quantity) || row.quantity < 1)) {
      toastError('Količina mora biti pozitivan broj.');
      return;
    }
    setSaving(true);
    try {
      await bulkCreateStockLotsApi(warehouseId, { items: payload });
      toastSuccess(`Evidentirano ${payload.length} stavki na skladištu`);
      onSaved();
      onBack();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri prijemu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <InventoryFreezeActionHint />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={14} />
          Nazad na skladište
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Prijem robe</h2>
          <p className="text-sm text-gray-500">Dodajte više stavki i sačuvajte odjednom.</p>
        </div>
      </div>

      <div className="space-y-4">
        {lines.map((line, index) => (
          <div key={line.key} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-800">Stavka {index + 1}</h3>
              {lines.length > 1 ? (
                <button
                  type="button"
                  className="text-red-600 hover:text-red-800"
                  onClick={() => setLines((rows) => rows.filter((row) => row.key !== line.key))}
                  aria-label="Ukloni stavku"
                >
                  <Trash2 size={16} />
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={labelClass}>Kategorija *</label>
                <select
                  value={line.categoryId}
                  onChange={(e) =>
                    updateLine(line.key, {
                      categoryId: e.target.value,
                      catalogItem: null,
                      preview: null,
                      previewError: null,
                    })
                  }
                  className={selectClass}
                >
                  <option value="">— Odaberi —</option>
                  {leafCategories.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Naziv / tip robe (šifrarnik) *</label>
                <CatalogItemAutocomplete
                  categoryId={line.categoryId}
                  value={line.catalogItem}
                  onChange={(item) => void handleCatalogItemChange(line.key, item)}
                  disabled={!line.categoryId}
                />
              </div>
              {line.catalogItem ? (
                <div className="md:col-span-2">
                  {line.previewLoading ? (
                    <div className="text-xs text-gray-500">Provjera postojećeg tipa robe…</div>
                  ) : line.previewError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {line.previewError}
                    </div>
                  ) : line.preview ? (
                    <div
                      className={
                        line.preview.exists
                          ? 'rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800'
                          : 'rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700'
                      }
                    >
                      <div>{line.preview.message}</div>
                      {line.preview.exists ? (
                        <div className="mt-1 text-xs text-blue-700">
                          Trenutno stanje: {line.preview.currentOnHand ?? 0} na stanju ·{' '}
                          {line.preview.currentReceived ?? 0} primljeno ukupno
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div>
                <label className={labelClass}>Količina *</label>
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Datum ulaza *</label>
                <input
                  type="date"
                  value={line.entryDate}
                  onChange={(e) => updateLine(line.key, { entryDate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Broj ugovora</label>
                <input
                  type="text"
                  value={line.contractNumber}
                  onChange={(e) => updateLine(line.key, { contractNumber: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setLines((rows) => [...rows, emptyLine()])}>
          <Plus size={14} />
          Dodaj stavku
        </Button>
        <Button disabled={saving || isFrozen} onClick={() => void handleSave()}>
          Sačuvaj prijem ({lines.length})
        </Button>
      </div>
    </div>
  );
};
