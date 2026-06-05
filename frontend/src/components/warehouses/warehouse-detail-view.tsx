import { useEffect, useState } from 'react';
import { ArrowLeft, Package, ArrowLeftRight, Trash2, Building2, Wrench } from 'lucide-react';
import { usePublicSettings } from '../../contexts/public-settings-context';
import { isCentralWarehouse } from '../../helpers/org-warehouse.util';
import { fetchTransfersPageApi } from '../../api/transfers-api';
import { WarehouseStockBrowsePanel } from './warehouse-stock-browse-panel';
import { WarehouseStockReceivePage } from './warehouse-stock-receive-page';
import { WarehouseMaintenanceStockPanel } from './warehouse-maintenance-stock-panel';
import { isSkladistar, isAdmin } from '../../store';
import { getCityLabel, formatDate } from '../../helpers';
import { useStore } from '../../useStore';
import type { PageId } from '../Layout';
import type { TransferRecord } from '../../types';
import { WarehouseDestructionPanel } from './warehouse-destruction-panel';
import { WarehouseContextPanel } from './warehouse-context-panel';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { cn } from '../../utils/cn';

type WarehouseTab = 'stock' | 'maintenance' | 'transfers' | 'destruction' | 'context';
type StockSubview = 'browse' | 'receive';

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
  const { getBoolean } = usePublicSettings();
  const maintenanceEnabled = getBoolean('features.maintenance_parts', true);
  const [state] = useStore();
  const [tab, setTab] = useState<WarehouseTab>('stock');
  const [stockSubview, setStockSubview] = useState<StockSubview>('browse');
  const [stockRefreshKey, setStockRefreshKey] = useState(0);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const warehouse = state.warehouses.find((row) => row.id === warehouseId);
  const orgUnit = warehouse?.orgUnitId
    ? state.orgUnits.find((row) => row.id === warehouse.orgUnitId)
    : null;

  useEffect(() => {
    if (tab !== 'transfers' || !warehouse) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setTransfersLoading(true);
      try {
        const response = await fetchTransfersPageApi({
          warehouseId: warehouse.id,
          page: 1,
          pageSize: 50,
          sortBy: 'date',
          sortDir: 'desc',
        });
        if (!cancelled) {
          setTransfers(response.items);
        }
      } catch {
        if (!cancelled) {
          setTransfers([]);
        }
      } finally {
        if (!cancelled) {
          setTransfersLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tab, warehouse]);

  if (!warehouse) {
    return (
      <p className="text-gray-500">Skladište nije pronađeno.</p>
    );
  }
  const tabs: { id: WarehouseTab; label: string; icon: typeof Package }[] = [
    { id: 'stock', label: 'Na skladištu', icon: Package },
    ...(maintenanceEnabled
      ? [{ id: 'maintenance' as const, label: 'Održavanje', icon: Wrench }]
      : []),
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
            <Badge tone="neutral">Roba na skladištu (lotovi)</Badge>
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
            onClick={() => {
              setTab(row.id);
              if (row.id !== 'stock') {
                setStockSubview('browse');
              }
            }}
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
      {tab === 'stock' && stockSubview === 'browse' ? (
        <WarehouseStockBrowsePanel
          key={stockRefreshKey}
          warehouseId={warehouse.id}
          canReceive={canReceiveStock}
          onOpenReceive={() => setStockSubview('receive')}
        />
      ) : null}
      {tab === 'stock' && stockSubview === 'receive' ? (
        <WarehouseStockReceivePage
          warehouseId={warehouse.id}
          onBack={() => setStockSubview('browse')}
          onSaved={() => setStockRefreshKey((value) => value + 1)}
        />
      ) : null}
      {tab === 'maintenance' && maintenanceEnabled ? (
        <WarehouseMaintenanceStockPanel
          warehouseId={warehouse.id}
          canReceive={canReceiveStock || admin || skladistar}
        />
      ) : null}
      {tab === 'transfers' ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
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
              {transfersLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Učitavam prenosnice…
                  </td>
                </tr>
              ) : transfers.map((transfer) => (
                <tr key={transfer.id} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{transfer.documentNumber}</td>
                  <td className="px-4 py-2">{transfer.type}</td>
                  <td className="px-4 py-2">{transfer.equipment?.inventoryNumber ?? '—'}</td>
                  <td className="px-4 py-2">{formatDate(transfer.date)}</td>
                  <td className="px-4 py-2">{transfer.status}</td>
                </tr>
              ))}
              {!transfersLoading && transfers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Nema povezanih prenosnica.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
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
        <WarehouseContextPanel warehouse={warehouse} canEditContext={canEditContext} />
      ) : null}
    </div>
  );
};
