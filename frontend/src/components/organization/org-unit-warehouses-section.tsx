import { useState } from 'react';
import { Plus, Warehouse } from 'lucide-react';
import { createWarehouseApi } from '../../api/warehouses-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import {
  countEquipmentInOrgSubtree,
  getDefaultCityIdForOrgUnit,
  getWarehousesForOrgUnit,
  resolveEffectiveWarehouseForOrgUnit,
} from '../../helpers/org-warehouse.util';
import { getCityLabel } from '../../helpers';
import { useStore, useRefreshData } from '../../useStore';
import type { OrgUnit } from '../../types';
import { Button } from '../ui/button';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';

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
  const [quickKeeperIds, setQuickKeeperIds] = useState('');
  const skladistarUsers = state.users.filter((user) => user.role === 'skladistar');
  const selectedQuickKeeperIds = quickKeeperIds.split(',').filter(Boolean);
  const defaultCityId = getDefaultCityIdForOrgUnit(state.orgUnits, orgUnit.id);
  const effectiveWarehouseId = resolveEffectiveWarehouseForOrgUnit(
    state.orgUnits,
    state.warehouses,
    orgUnit.id,
    defaultCityId,
  );
  const effectiveWarehouse = effectiveWarehouseId
    ? state.warehouses.find((row) => row.id === effectiveWarehouseId)
    : null;
  const showInherited =
    effectiveWarehouse &&
    !warehouses.some((row) => row.id === effectiveWarehouse.id);
  const handleQuickCreate = async () => {
    if (!quickName.trim() || !quickAddress.trim() || !defaultCityId) {
      toastError('Unesite naziv i adresu; org jedinica mora imati efektivni grad.');
      return;
    }
    if (selectedQuickKeeperIds.length < 1) {
      toastError('Odaberite barem jednog skladištara');
      return;
    }
    try {
      await createWarehouseApi({
        name: quickName.trim(),
        cityId: defaultCityId,
        address: quickAddress.trim(),
        orgUnitId: orgUnit.id,
        keeperUserIds: selectedQuickKeeperIds,
      });
      setQuickName('');
      setQuickAddress('');
      setQuickKeeperIds('');
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
      {showInherited && effectiveWarehouse ? (
        <p className="text-xs text-slate-600 rounded-md bg-white border border-slate-200 px-2 py-1.5">
          Efektivno skladište (nasljeđeno): <strong>{effectiveWarehouse.name}</strong>
          {effectiveWarehouse.orgUnitId !== orgUnit.id ? (
            <span className="text-gray-400"> — dodijeljeno na nadređenom čvoru</span>
          ) : null}
        </p>
      ) : null}
      <p className="text-[11px] text-gray-400">
        Skladište na ovom čvoru nadjačava nasljeđeno za cijelo podstablo.
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
          <div>
            <label className={labelClass} htmlFor={`quick-keepers-${orgUnit.id}`}>
              Skladištari *
            </label>
            {skladistarUsers.length === 0 ? (
              <p className="text-xs text-amber-800">Nema korisnika s ulogom Skladištar.</p>
            ) : (
              <select
                id={`quick-keepers-${orgUnit.id}`}
                multiple
                value={selectedQuickKeeperIds}
                onChange={(event) =>
                  setQuickKeeperIds(
                    Array.from(event.target.selectedOptions).map((option) => option.value).join(','),
                  )
                }
                className={`${selectClass} min-h-[72px]`}
              >
                {skladistarUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.username}
                  </option>
                ))}
              </select>
            )}
          </div>
          <Button
            onClick={() => void handleQuickCreate()}
            disabled={!defaultCityId || selectedQuickKeeperIds.length < 1}
          >
            Kreiraj skladište
          </Button>
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
