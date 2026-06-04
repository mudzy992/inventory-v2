import { useMemo, useState } from 'react';
import { Plus, List, Warehouse as WarehouseIcon } from 'lucide-react';
import { createWarehouseApi } from '../api/warehouses-api';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/toast-context';
import { useAuth } from '../contexts/AuthContext';
import { useStore, useRefreshData } from '../useStore';
import { isAdmin, isSkladistar } from '../store';
import { WarehouseDetailView } from './warehouses/warehouse-detail-view';
import {
  getUserWarehouseIds,
  isCentralWarehouse,
} from '../helpers/org-warehouse.util';
import { getCityLabel, getOrgUnitTypeLabel } from '../helpers';
import {
  InventoryFreezeActionHint,
  useInventoryFreezeActive,
} from './inventory-count/inventory-freeze-action-hint';
import type { PageId } from './Layout';
import { PageHeader } from './ui/page-header';
import { FormCard } from './ui/form-card';
import { Button } from './ui/button';
import { DataTable } from './ui/data-table';
import { EmptyState } from './ui/empty-state';
import { Badge } from './ui/badge';
import { inputClass, labelClass, selectClass } from './ui/form-styles';
import { PageTabs } from './ui/page-tabs';

type WarehousesTab = 'list' | 'create';

interface WarehousesPageProps {
  onNavigate?: (page: PageId) => void;
}

export const WarehousesPage = ({ onNavigate }: WarehousesPageProps) => {
  const [state] = useStore();
  const { user } = useAuth();
  const refresh = useRefreshData();
  const { toastError } = useToast();
  const admin = isAdmin();
  const skladistar = isSkladistar();
  const isFrozen = useInventoryFreezeActive();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [cityId, setCityId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [address, setAddress] = useState('');
  const [keeperIds, setKeeperIds] = useState('');
  const [tab, setTab] = useState<WarehousesTab>('list');
  const visibleWarehouseIds = useMemo(
    () => getUserWarehouseIds(user?.role, user?.id, user?.registrarScopes ?? [], state.warehouses),
    [state.warehouses, user?.id, user?.registrarScopes, user?.role],
  );
  const visibleWarehouses = useMemo(
    () => state.warehouses.filter((row) => visibleWarehouseIds.has(row.id)),
    [state.warehouses, visibleWarehouseIds],
  );
  const skladistarUsers = state.users.filter((u) => u.role === 'skladistar');
  const selectedKeeperIds = keeperIds.split(',').filter(Boolean);
  const isCreateFormValid =
    Boolean(name.trim()) &&
    Boolean(cityId) &&
    Boolean(address.trim()) &&
    Boolean(orgUnitId) &&
    selectedKeeperIds.length >= 1;
  const canManageDestruction = admin || skladistar;
  const handleCreate = async () => {
    if (!admin || isFrozen) {
      return;
    }
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
    try {
      await createWarehouseApi({
        name: name.trim(),
        cityId,
        address: address.trim(),
        orgUnitId,
        keeperUserIds: selectedKeeperIds,
      });
      setName('');
      setAddress('');
      setOrgUnitId('');
      setKeeperIds('');
      setCityId('');
      await refresh();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  if (selectedWarehouseId) {
    return (
      <WarehouseDetailView
        warehouseId={selectedWarehouseId}
        onBack={() => setSelectedWarehouseId(null)}
        canEditContext={admin}
        canManageDestruction={canManageDestruction}
        canReceiveStock={skladistar || admin}
        onNavigate={onNavigate}
      />
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={skladistar && !admin ? 'Moja skladišta' : 'Skladišta'}
        description={
          skladistar && !admin
            ? 'Pregled stanja, prenosnica i uništenja po vašim skladištima.'
            : 'Registry skladišta vezana za org-jedinicu i skladištare.'
        }
      />
      <InventoryFreezeActionHint onOpenInventory={onNavigate} />
      <PageTabs
        tabs={[
          { id: 'list', label: 'Lista', icon: List },
          ...(admin ? [{ id: 'create' as const, label: 'Novo skladište', icon: WarehouseIcon }] : []),
        ]}
        activeTab={tab}
        onChange={setTab}
      />
      {tab === 'create' && admin ? (
        <FormCard title="Novo skladište" className="max-w-lg">
          <div>
            <label className={labelClass} htmlFor="wh-create-name">
              Naziv *
            </label>
            <input
              id="wh-create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="wh-create-city">
              Grad *
            </label>
            <select
              id="wh-create-city"
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
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
            <label className={labelClass} htmlFor="wh-create-org">
              Org. jedinica *
            </label>
            <select
              id="wh-create-org"
              value={orgUnitId}
              onChange={(e) => setOrgUnitId(e.target.value)}
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
            <label className={labelClass} htmlFor="wh-create-address">
              Adresa *
            </label>
            <input
              id="wh-create-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="wh-create-keepers">
              Skladištari * (Ctrl+klik za više)
            </label>
            {skladistarUsers.length === 0 ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                Nema korisnika s ulogom Skladištar.
              </p>
            ) : (
              <select
                id="wh-create-keepers"
                multiple
                value={selectedKeeperIds}
                onChange={(e) =>
                  setKeeperIds(Array.from(e.target.selectedOptions).map((o) => o.value).join(','))
                }
                className={`${selectClass} min-h-[80px]`}
              >
                {skladistarUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </select>
            )}
          </div>
          <Button
            onClick={() => void handleCreate()}
            disabled={isFrozen || !isCreateFormValid}
          >
            <Plus size={14} /> Kreiraj
          </Button>
        </FormCard>
      ) : null}
      {tab === 'list' ? (
      <DataTable>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Naziv</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Tip</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Lokacija</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Org</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Akcija</th>
            </tr>
          </thead>
          <tbody>
            {visibleWarehouses.map((wh) => {
              const org = wh.orgUnitId ? state.orgUnits.find((row) => row.id === wh.orgUnitId) : null;
              return (
                <tr key={wh.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{wh.name}</td>
                  <td className="px-4 py-3">
                    <Badge tone={isCentralWarehouse(wh) ? 'info' : 'success'}>
                      {isCentralWarehouse(wh) ? 'Centralno' : 'Org'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{getCityLabel(state.cities, wh.cityId)}</td>
                  <td className="px-4 py-3 text-gray-600">{org?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-sm text-blue-600 underline"
                      onClick={() => setSelectedWarehouseId(wh.id)}
                    >
                      Otvori detalj
                    </button>
                  </td>
                </tr>
              );
            })}
            {visibleWarehouses.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState message="Nema skladišta u vašem opsegu." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </DataTable>
      ) : null}
    </div>
  );
};
