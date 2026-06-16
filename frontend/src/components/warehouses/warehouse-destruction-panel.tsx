import { useCallback, useEffect, useState } from 'react';
import { destroyEquipmentApi, fetchReadyForDestructionApi } from '../../api/warehouses-api';
import { ApiError } from '../../api/client';
import { canDestroyEquipment } from '../../helpers/guards';
import { getApiErrorMessage, refreshAfterMutation } from '../../helpers/run-mutation-with-refresh.util';
import { useInventoryFreezeActive } from '../inventory-count/inventory-freeze-action-hint';
import { Button } from '../ui/button';

interface ReadyItem {
  id: string;
  inventoryNumber: string;
}

interface WarehouseDestructionPanelProps {
  warehouseId: string;
  warehouseName: string;
}

export const WarehouseDestructionPanel = ({
  warehouseId,
  warehouseName,
}: WarehouseDestructionPanelProps) => {
  const isFrozen = useInventoryFreezeActive();
  const [items, setItems] = useState<ReadyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchReadyForDestructionApi(warehouseId);
      setItems(rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Greška pri učitavanju');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleDestroy = async (equipmentId: string, inventoryNumber: string) => {
    const guard = canDestroyEquipment({ isFrozen });
    if (!guard.allowed) {
      setError(guard.reason ?? 'Uništenje nije dozvoljeno.');
      return;
    }
    if (!window.confirm(`Potvrdite uništenje opreme ${inventoryNumber}?`)) {
      return;
    }
    try {
      await destroyEquipmentApi(warehouseId, equipmentId);
      await refreshAfterMutation([loadItems]);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Greška pri uništenju'));
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
      <p className="text-xs font-medium text-amber-900">Za uništenje — {warehouseName}</p>
      {loading ? <p className="text-xs text-gray-500">Učitavanje…</p> : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {!loading && items.length === 0 ? (
        <p className="text-xs text-gray-600">Nema opreme spremne za uništenje.</p>
      ) : null}
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{item.inventoryNumber}</span>
            <Button
              type="button"
              variant="outline"
              className="text-xs h-7"
              disabled={isFrozen}
              title={isFrozen ? 'Aktivan popis blokira uništenje opreme.' : undefined}
              onClick={() => void handleDestroy(item.id, item.inventoryNumber)}
            >
              Potvrdi uništenje
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
};
