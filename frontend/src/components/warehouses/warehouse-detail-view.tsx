import { useMemo, useState } from 'react';
import { ArrowLeft, Package, ArrowLeftRight, Trash2, Building2 } from 'lucide-react';
import { updateWarehouseApi } from '../../api/warehouses-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { filterTransfersForWarehouse, isCentralWarehouse } from '../../helpers/org-warehouse.util';
import { WarehouseStockPanel } from './warehouse-stock-panel';
import { isSkladistar, isAdmin } from '../../store';
import { getCityLabel, formatDate } from '../../helpers';
import { useStore, useRefreshData } from '../../useStore';
import type { PageId } from '../Layout';
import { WarehouseDestructionPanel } from './warehouse-destruction-panel';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';
import { cn } from '../../utils/cn';

type WarehouseTab = 'stock' | 'transfers' | 'destruction' | 'context';

interface WarehouseDetailViewProps {
  warehouseId: string;
  onBack: () => void;
  canEditContext?: boolean;
  canManageDestruction?: boolean;
  canReceiveStock?: boolean;
  onNavigate?: (page: PageId) => void;
}

export const WarehouseDetailView = ({
  warehouseId,
  onBack,
  canEditContext = false,
  canManageDestruction = false,
  canReceiveStock = false,
  onNavigate,
}: WarehouseDetailViewProps) => {
  const admin = isAdmin();
  const skladistar = isSkladistar();
  const [state] = useStore();
  const refresh = useRefreshData();
  const { toastError } = useToast();
  const [tab, setTab] = useState<WarehouseTab>('stock');
  const warehouse = state.warehouses.find((row) => row.id === warehouseId);
  const orgUnit = warehouse?.orgUnitId
    ? state.orgUnits.find((row) => row.id === warehouse.orgUnitId)
    : null;
  const transfers = useMemo(
    () => (warehouse ? filterTransfersForWarehouse(warehouse.id, state) : []),
    [state.transfers, warehouse],
  );
  const [editOrgUnitId, setEditOrgUnitId] = useState(warehouse?.orgUnitId ?? '');
  const [saving, setSaving] = useState(false);
  if (!warehouse) {
    return (
      <p className="text-gray-500">Skladište nije pronađeno.</p>
    );
  }
  const handleSaveContext = async () => {
    setSaving(true);
    try {
      await updateWarehouseApi(warehouse.id, {
        orgUnitId: editOrgUnitId || null,
      });
      await refresh();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    } finally {
      setSaving(false);
    }
  };
  const tabs: { id: WarehouseTab; label: string; icon: typeof Package }[] = [
    { id: 'stock', label: 'Na skladištu', icon: Package },
    { id: 'transfers', label: 'Zaduženja / Razduženja', icon: ArrowLeftRight },
    { id: 'destruction', label: 'Rashod / Uništenje', icon: Trash2 },
    { id: 'context', label: 'Kontekst', icon: Building2 },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={14} />
          Nazad
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-gray-900">{warehouse.name}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {getCityLabel(state.cities, warehouse.cityId)}
            {orgUnit ? ` · ${orgUnit.name}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={isCentralWarehouse(warehouse) ? 'info' : 'success'}>
              {isCentralWarehouse(warehouse) ? 'Centralno skladište' : 'Org-jedinica'}
            </Badge>
            <Badge tone="neutral">Lotovi (neizdana roba)</Badge>
          </div>
        </div>
        {onNavigate && (admin || !skladistar) ? (
          <Button variant="secondary" onClick={() => onNavigate('equipment')}>
            Oprema (globalno)
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-2">
        {tabs.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setTab(row.id)}
            className={cn(
              'inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border',
              tab === row.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
            )}
          >
            <row.icon size={14} />
            {row.label}
          </button>
        ))}
      </div>
      {tab === 'stock' ? (
        <WarehouseStockPanel warehouseId={warehouse.id} canReceive={canReceiveStock} />
      ) : null}
      {tab === 'transfers' ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">Dokument</th>
                <th className="text-left px-4 py-2">Tip</th>
                <th className="text-left px-4 py-2">Oprema</th>
                <th className="text-left px-4 py-2">Datum</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {transfers.slice(0, 50).map((transfer) => {
                const equipment = state.equipment.find((row) => row.id === transfer.equipmentId);
                return (
                  <tr key={transfer.id} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">{transfer.documentNumber}</td>
                    <td className="px-4 py-2">{transfer.type}</td>
                    <td className="px-4 py-2">{equipment?.inventoryNumber ?? '—'}</td>
                    <td className="px-4 py-2">{formatDate(transfer.date)}</td>
                    <td className="px-4 py-2">{transfer.status}</td>
                  </tr>
                );
              })}
              {transfers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Nema povezanih prenosnica.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {onNavigate ? (
            <div className="p-3 border-t">
              <Button variant="secondary" onClick={() => onNavigate('transfers')}>
                Svi transferi
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {tab === 'destruction' && canManageDestruction ? (
        <WarehouseDestructionPanel warehouseId={warehouse.id} warehouseName={warehouse.name} />
      ) : null}
      {tab === 'destruction' && !canManageDestruction ? (
        <p className="text-sm text-gray-500">Pregled uništenja dostupan skladištaru ili administratoru.</p>
      ) : null}
      {tab === 'context' ? (
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 max-w-lg">
          <p className="text-sm text-gray-700">
            <strong>Adresa:</strong> {warehouse.address}
          </p>
          <p className="text-sm text-gray-700">
            <strong>Skladištari:</strong>{' '}
            {warehouse.keepers?.map((keeper) => keeper.user?.username).filter(Boolean).join(', ') || '—'}
          </p>
          {canEditContext ? (
            <>
              <label className={labelClass}>Org-jedinica</label>
              <select
                value={editOrgUnitId}
                onChange={(event) => setEditOrgUnitId(event.target.value)}
                className={selectClass}
              >
                <option value="">— Centralno (bez org) —</option>
                {state.orgUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              <Button disabled={saving} onClick={() => void handleSaveContext()}>
                Sačuvaj kontekst
              </Button>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              Org-jedinica: {orgUnit?.name ?? 'Centralno'}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};
