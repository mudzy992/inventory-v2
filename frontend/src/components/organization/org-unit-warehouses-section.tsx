import { useState } from 'react';
import { Plus, Warehouse } from 'lucide-react';
import { createWarehouseApi } from '../../api/warehouses-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import {
  countEquipmentInOrgSubtree,
  getDefaultCityIdForOrgUnit,
  getWarehousesForOrgUnit,
} from '../../helpers/org-warehouse.util';
import { getCityLabel } from '../../helpers';
import { useStore, useRefreshData } from '../../useStore';
import type { OrgUnit } from '../../types';
import { Button } from '../ui/button';
import { inputClass, labelClass } from '../ui/form-styles';

interface OrgUnitWarehousesSectionProps {
  orgUnit: OrgUnit;
  onOpenWarehouse?: (warehouseId: string) => void;
}

export const OrgUnitWarehousesSection = ({
  orgUnit,
  onOpenWarehouse,
}: OrgUnitWarehousesSectionProps) => {
  const [state] = useStore();
  const { toastError } = useToast();
  const refresh = useRefreshData();
  const warehouses = getWarehousesForOrgUnit(state.warehouses, orgUnit.id);
  const subtreeCount = countEquipmentInOrgSubtree(state, orgUnit.id);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickAddress, setQuickAddress] = useState('');
  const defaultCityId = getDefaultCityIdForOrgUnit(state.orgUnits, orgUnit.id);
  const handleQuickCreate = async () => {
    if (!quickName.trim() || !quickAddress.trim() || !defaultCityId) {
      toastError('Unesite naziv i adresu; org jedinica mora imati efektivni grad.');
      return;
    }
    try {
      await createWarehouseApi({
        name: quickName.trim(),
        cityId: defaultCityId,
        address: quickAddress.trim(),
        orgUnitId: orgUnit.id,
      });
      setQuickName('');
      setQuickAddress('');
      setShowQuickCreate(false);
      await refresh();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
          <Warehouse size={16} />
          Skladišta ove org-jedinice
        </p>
        <Button variant="secondary" className="text-xs h-8" onClick={() => setShowQuickCreate((v) => !v)}>
          <Plus size={14} />
          Brzo kreiranje
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        Oprema u podstablu (zadužena + na skladištima org-a): <strong>{subtreeCount}</strong> stavki
      </p>
      {showQuickCreate ? (
        <div className="space-y-2 bg-white rounded-lg p-3 border border-gray-100">
          <input
            value={quickName}
            onChange={(event) => setQuickName(event.target.value)}
            placeholder="Naziv skladišta"
            className={inputClass}
          />
          <input
            value={quickAddress}
            onChange={(event) => setQuickAddress(event.target.value)}
            placeholder="Adresa"
            className={inputClass}
          />
          <p className="text-[11px] text-gray-500">
            Grad: {defaultCityId ? getCityLabel(state.cities, defaultCityId) : '— postavite lokaciju na čvoru'}
          </p>
          <Button onClick={() => void handleQuickCreate()}>Kreiraj skladište</Button>
        </div>
      ) : null}
      <ul className="space-y-1">
        {warehouses.map((warehouse) => (
          <li key={warehouse.id} className="flex items-center justify-between text-sm">
            <span>{warehouse.name}</span>
            {onOpenWarehouse ? (
              <button
                type="button"
                className="text-xs text-blue-600 underline"
                onClick={() => onOpenWarehouse(warehouse.id)}
              >
                Detalj
              </button>
            ) : null}
          </li>
        ))}
        {warehouses.length === 0 ? (
          <li className="text-xs text-gray-500">Nema skladišta vezanih za ovu jedinicu.</li>
        ) : null}
      </ul>
    </div>
  );
};
