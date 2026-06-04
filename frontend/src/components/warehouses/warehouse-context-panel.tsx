import { useEffect, useMemo, useState } from 'react';
import { updateWarehouseApi } from '../../api/warehouses-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { getCityLabel, getOrgUnitTypeLabel } from '../../helpers';
import { useStore, useRefreshData } from '../../useStore';
import { isAdmin } from '../../store';
import type { Warehouse } from '../../types';
import { FormCard } from '../ui/form-card';
import { Button } from '../ui/button';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';
import { WarehouseTransferTemplatePanel } from './warehouse-transfer-template-panel';

interface WarehouseContextPanelProps {
  warehouse: Warehouse;
  canEditContext?: boolean;
}

export const WarehouseContextPanel = ({
  warehouse,
  canEditContext = false,
}: WarehouseContextPanelProps) => {
  const [state] = useStore();
  const refresh = useRefreshData();
  const { toastError, toastSuccess } = useToast();
  const admin = isAdmin();
  const skladistarUsers = useMemo(
    () => state.users.filter((user) => user.role === 'skladistar'),
    [state.users],
  );
  const [name, setName] = useState(warehouse.name);
  const [cityId, setCityId] = useState(warehouse.cityId);
  const [address, setAddress] = useState(warehouse.address);
  const [orgUnitId, setOrgUnitId] = useState(warehouse.orgUnitId ?? '');
  const [notes, setNotes] = useState(warehouse.notes ?? '');
  const [keeperIds, setKeeperIds] = useState(
    () => warehouse.keepers?.map((keeper) => keeper.userId).join(',') ?? '',
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(warehouse.name);
    setCityId(warehouse.cityId);
    setAddress(warehouse.address);
    setOrgUnitId(warehouse.orgUnitId ?? '');
    setNotes(warehouse.notes ?? '');
    setKeeperIds(warehouse.keepers?.map((keeper) => keeper.userId).join(',') ?? '');
  }, [warehouse]);

  const selectedKeeperIds = keeperIds.split(',').filter(Boolean);
  const orgUnit = warehouse.orgUnitId
    ? state.orgUnits.find((row) => row.id === warehouse.orgUnitId)
    : null;

  const handleSave = async () => {
    if (!name.trim()) {
      toastError('Naziv skladišta je obavezan');
      return;
    }
    if (!cityId) {
      toastError('Grad je obavezan');
      return;
    }
    if (!address.trim()) {
      toastError('Adresa je obavezna');
      return;
    }
    if (!orgUnitId) {
      toastError('Org. jedinica je obavezna');
      return;
    }
    if (selectedKeeperIds.length < 1) {
      toastError('Odaberite barem jednog skladištara');
      return;
    }
    setSaving(true);
    try {
      await updateWarehouseApi(warehouse.id, {
        name: name.trim(),
        cityId,
        address: address.trim(),
        orgUnitId,
        notes: notes.trim() || undefined,
        keeperUserIds: selectedKeeperIds,
      });
      await refresh();
      toastSuccess('Kontekst skladišta sačuvan');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <FormCard title="Podaci skladišta">
        {canEditContext ? (
          <div className="space-y-3">
            <div>
              <label className={labelClass} htmlFor="wh-context-name">
                Naziv *
              </label>
              <input
                id="wh-context-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wh-context-city">
                Grad *
              </label>
              <select
                id="wh-context-city"
                value={cityId}
                onChange={(event) => setCityId(event.target.value)}
                className={selectClass}
              >
                <option value="">— Odaberi grad —</option>
                {state.cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {getCityLabel(state.cities, city.id)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="wh-context-address">
                Adresa *
              </label>
              <input
                id="wh-context-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wh-context-org">
                Org. jedinica *
              </label>
              <select
                id="wh-context-org"
                value={orgUnitId}
                onChange={(event) => setOrgUnitId(event.target.value)}
                className={selectClass}
              >
                <option value="">— Odaberi org. jedinicu —</option>
                {state.orgUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({getOrgUnitTypeLabel(unit.type)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="wh-context-keepers">
                Skladištari * (Ctrl+klik za više)
              </label>
              {skladistarUsers.length === 0 ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  Nema korisnika s ulogom Skladištar.
                </p>
              ) : (
                <select
                  id="wh-context-keepers"
                  multiple
                  value={selectedKeeperIds}
                  onChange={(event) =>
                    setKeeperIds(Array.from(event.target.selectedOptions).map((option) => option.value).join(','))
                  }
                  className={`${selectClass} min-h-[80px]`}
                >
                  {skladistarUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className={labelClass} htmlFor="wh-context-notes">
                Napomena
              </label>
              <textarea
                id="wh-context-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className={`${inputClass} min-h-[72px]`}
                rows={3}
              />
            </div>
            <Button disabled={saving} onClick={() => void handleSave()}>
              Sačuvaj
            </Button>
          </div>
        ) : (
          <dl className="space-y-2 text-sm text-gray-700">
            <div>
              <dt className="text-gray-500">Naziv</dt>
              <dd className="font-medium">{warehouse.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Grad</dt>
              <dd>{getCityLabel(state.cities, warehouse.cityId)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Adresa</dt>
              <dd>{warehouse.address}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Org. jedinica</dt>
              <dd>{orgUnit?.name ?? '— (legacy centralno)'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Skladištari</dt>
              <dd>
                {warehouse.keepers?.map((keeper) => keeper.user?.username).filter(Boolean).join(', ') ||
                  '—'}
              </dd>
            </div>
            {warehouse.notes ? (
              <div>
                <dt className="text-gray-500">Napomena</dt>
                <dd>{warehouse.notes}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </FormCard>
      {admin ? (
        <FormCard title="Obrazac prenosnice">
          <WarehouseTransferTemplatePanel
            warehouseId={warehouse.id}
            hasOrgUnit={Boolean(orgUnitId || warehouse.orgUnitId)}
            embedded
          />
        </FormCard>
      ) : null}
    </div>
  );
};
