import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { createStockLotApi, fetchWarehouseStockLotsApi } from '../../api/warehouse-stock-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { formatDate } from '../../helpers';
import { getLeafCategories, getStockLotStatusLabel } from '../../helpers/warehouse-stock.util';
import type { WarehouseStockLot } from '../../types';
import { useStore } from '../../useStore';
import { Button } from '../ui/button';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';
import {
  InventoryFreezeActionHint,
  useInventoryFreezeActive,
} from '../inventory-count/inventory-freeze-action-hint';

interface WarehouseStockPanelProps {
  warehouseId: string;
  canReceive: boolean;
}

export const WarehouseStockPanel = ({ warehouseId, canReceive }: WarehouseStockPanelProps) => {
  const [state] = useStore();
  const { toastError, toastSuccess } = useToast();
  const isFrozen = useInventoryFreezeActive();
  const [lots, setLots] = useState<WarehouseStockLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReceive, setShowReceive] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [contractNumber, setContractNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const leafCategories = getLeafCategories(state.categories);
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
      await createStockLotApi(warehouseId, {
        categoryId,
        productName: productName.trim(),
        quantity: qty,
        entryDate,
        contractNumber: contractNumber.trim() || undefined,
      });
      toastSuccess('Roba je evidentirana na skladištu');
      setShowReceive(false);
      setProductName('');
      setQuantity('1');
      setCategoryId('');
      setContractNumber('');
      await loadLots();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri prijemu');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-3">
      <InventoryFreezeActionHint />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Neizdana roba (lotovi) — bez inventurnog broja do izdavanja od evidentičara.</p>
        {canReceive ? (
          <Button
            disabled={isFrozen}
            onClick={() => setShowReceive(true)}
            aria-label="Prijem robe na skladište"
          >
            <Plus size={14} />
            Prijem robe
          </Button>
        ) : null}
      </div>
      {showReceive ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 max-w-lg">
          <h3 className="font-medium text-gray-900">Prijem robe</h3>
          <div>
            <label className={labelClass}>Kategorija *</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectClass}>
              <option value="">— Odaberi —</option>
              {leafCategories.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Naziv / tip robe *</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className={inputClass}
              placeholder="npr. Računar Dell 3080 SFF"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Količina *</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Datum ulaza *</label>
              <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Broj ugovora</label>
            <input type="text" value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} className={inputClass} />
          </div>
          <div className="flex gap-2">
            <Button disabled={saving || isFrozen} onClick={() => void handleReceive()}>
              Sačuvaj prijem
            </Button>
            <Button variant="secondary" onClick={() => setShowReceive(false)}>
              Odustani
            </Button>
          </div>
        </div>
      ) : null}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">Naziv robe</th>
              <th className="text-left px-4 py-2">Kategorija</th>
              <th className="text-left px-4 py-2">Količina</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Ulaz</th>
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
              lots.map((lot) => (
                <tr key={lot.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{lot.productName}</td>
                  <td className="px-4 py-2">{lot.categoryName ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {lot.quantityOnHand}/{lot.quantityReceived}
                  </td>
                  <td className="px-4 py-2">{getStockLotStatusLabel(lot.status)}</td>
                  <td className="px-4 py-2">{formatDate(lot.entryDate)}</td>
                </tr>
              ))}
            {!loading && lots.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Nema lotova na skladištu.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};
