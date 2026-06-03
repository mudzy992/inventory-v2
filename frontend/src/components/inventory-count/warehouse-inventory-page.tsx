import { useCallback, useEffect, useState } from 'react';
import {
  closeWarehouseCommitteeApi,
  fetchMyWarehouseCommitteesApi,
  fetchWarehouseCommitteeScopeApi,
  recordWarehouseInventoryLineApi,
  type InventoryWarehouseCommitteeRow,
  type InventoryWarehouseScopeItem,
} from '../../api/inventory-warehouse-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { PageHeader } from '../ui/page-header';
import { Button } from '../ui/button';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';
import { Badge } from '../ui/badge';

export const WarehouseInventoryPage = () => {
  const { toastError, toastSuccess } = useToast();
  const [committees, setCommittees] = useState<InventoryWarehouseCommitteeRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<{
    committee: InventoryWarehouseCommitteeRow;
    items: InventoryWarehouseScopeItem[];
  } | null>(null);
  const [savingLotId, setSavingLotId] = useState<string | null>(null);
  const loadCommittees = useCallback(async () => {
    try {
      const rows = await fetchMyWarehouseCommitteesApi();
      setCommittees(rows);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  }, [toastError]);
  useEffect(() => {
    void loadCommittees();
  }, [loadCommittees]);
  const openCommittee = async (id: string) => {
    setSelectedId(id);
    try {
      const data = await fetchWarehouseCommitteeScopeApi(id);
      setScope(data);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  const handleLine = async (
    stockLotId: string,
    status: 'prisutna' | 'nije_prisutna' | 'ostecena',
    quantityCounted: number,
    note?: string,
  ) => {
    if (!selectedId) {
      return;
    }
    setSavingLotId(stockLotId);
    try {
      await recordWarehouseInventoryLineApi(selectedId, {
        stockLotId,
        status,
        quantityCounted,
        note,
      });
      await openCommittee(selectedId);
      toastSuccess('Linija popisa sačuvana');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    } finally {
      setSavingLotId(null);
    }
  };
  const handleClose = async () => {
    if (!selectedId) {
      return;
    }
    try {
      await closeWarehouseCommitteeApi(selectedId);
      toastSuccess('Lista popisa zaključena');
      setSelectedId(null);
      setScope(null);
      await loadCommittees();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  if (selectedId && scope) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => { setSelectedId(null); setScope(null); }}>
          Nazad
        </Button>
        <PageHeader
          title={`Popis: ${scope.committee.warehouse?.name ?? 'Skladište'}`}
          description={scope.committee.session?.name ?? ''}
        />
        {scope.committee.isClosed ? (
          <Badge tone="warning">Lista zaključena</Badge>
        ) : (
          <Button onClick={() => void handleClose()}>Zaključi listu (predsjednik)</Button>
        )}
        <div className="space-y-4">
          {scope.items.map((item) => (
            <WarehouseLineCard
              key={item.stockLot.id}
              item={item}
              disabled={scope.committee.isClosed}
              saving={savingLotId === item.stockLot.id}
              onSave={(status, qty, note) =>
                void handleLine(item.stockLot.id, status, qty, note)
              }
            />
          ))}
          {scope.items.length === 0 ? (
            <p className="text-gray-500 text-sm">Nema neizdane robe za popis.</p>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="Popis skladišta"
        description="Evidentirajte prisutnost i količinu neizdane robe na vašem skladištu."
      />
      <div className="bg-white rounded-xl border border-gray-100 divide-y">
        {committees.map((row) => (
          <button
            key={row.id}
            type="button"
            className="w-full px-4 py-3 text-left hover:bg-gray-50"
            onClick={() => void openCommittee(row.id)}
          >
            <p className="font-medium">{row.warehouse?.name}</p>
            <p className="text-xs text-gray-500">{row.session?.name}</p>
          </button>
        ))}
        {committees.length === 0 ? (
          <p className="px-4 py-10 text-center text-gray-400">Nema aktivnih skladišnih komisija.</p>
        ) : null}
      </div>
    </div>
  );
};

interface WarehouseLineCardProps {
  item: InventoryWarehouseScopeItem;
  disabled: boolean;
  saving: boolean;
  onSave: (status: 'prisutna' | 'nije_prisutna' | 'ostecena', quantityCounted: number, note?: string) => void;
}

const WarehouseLineCard = ({ item, disabled, saving, onSave }: WarehouseLineCardProps) => {
  const [status, setStatus] = useState<'prisutna' | 'nije_prisutna' | 'ostecena'>(
    (item.line?.status as 'prisutna' | 'nije_prisutna' | 'ostecena') ?? 'prisutna',
  );
  const [quantity, setQuantity] = useState(String(item.line?.quantityCounted ?? item.stockLot.quantityOnHand));
  const [note, setNote] = useState(item.line?.note ?? '');
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
      <p className="font-medium">{item.stockLot.productName}</p>
      <p className="text-xs text-gray-500">
        {item.stockLot.category?.name} · očekivano: {item.stockLot.quantityOnHand}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className={labelClass}>Status</label>
          <select
            value={status}
            disabled={disabled}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={selectClass}
          >
            <option value="prisutna">Prisutna</option>
            <option value="nije_prisutna">Nije prisutna</option>
            <option value="ostecena">Oštećena</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Prebrojano</label>
          <input
            type="number"
            min={0}
            disabled={disabled}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Napomena</label>
          <input
            type="text"
            disabled={disabled}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      {!disabled ? (
        <Button
          disabled={saving}
          onClick={() => onSave(status, Number.parseInt(quantity, 10) || 0, note || undefined)}
        >
          Sačuvaj
        </Button>
      ) : null}
    </div>
  );
};
