import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, ChevronRight } from 'lucide-react';
import {
  fetchAssignedStockLotsApi,
  fetchStockLotApi,
  issueStockLotUnitApi,
  updateStockLotSpecApi,
} from '../../api/warehouse-stock-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { formatDate, getEmployeeFullName } from '../../helpers';
import { getStockLotStatusLabel } from '../../helpers/warehouse-stock.util';
import { employeeMatchesScope } from '../../helpers/registrar-scope';
import { useStore, useRefreshData } from '../../useStore';
import { getCurrentUser } from '../../store';
import type { Category, WarehouseStockLot } from '../../types';
import { PageHeader } from '../ui/page-header';
import { Button } from '../ui/button';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';
import { Badge } from '../ui/badge';
import {
  InventoryFreezeActionHint,
  useInventoryFreezeActive,
} from '../inventory-count/inventory-freeze-action-hint';

const buildSpecFields = (category: Category | undefined, unique: boolean) => {
  if (!category) {
    return [];
  }
  return [...category.fields, ...category.optionalFields].filter((field) => field.unique === unique);
};

export const RegistrarStockPage = () => {
  const [state] = useStore();
  const refresh = useRefreshData();
  const user = getCurrentUser();
  const { toastError, toastSuccess } = useToast();
  const isFrozen = useInventoryFreezeActive();
  const [lots, setLots] = useState<WarehouseStockLot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WarehouseStockLot | null>(null);
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [issueOpen, setIssueOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [inventoryNumber, setInventoryNumber] = useState('');
  const [uniqueSpecs, setUniqueSpecs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const loadLots = useCallback(async () => {
    try {
      const rows = await fetchAssignedStockLotsApi();
      setLots(rows);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  }, [toastError]);
  useEffect(() => {
    void loadLots();
  }, [loadLots]);
  const category = useMemo(
    () => (detail ? state.categories.find((row) => row.id === detail.categoryId) : undefined),
    [detail, state.categories],
  );
  const lotFields = useMemo(() => buildSpecFields(category, false), [category]);
  const issueFields = useMemo(() => buildSpecFields(category, true), [category]);
  const scopedEmployees = useMemo(
    () => state.employees.filter((emp) => employeeMatchesScope(emp, state, user)),
    [state, user],
  );
  const openDetail = async (id: string) => {
    setSelectedId(id);
    try {
      const row = await fetchStockLotApi(id);
      setDetail(row);
      setSpecs((row.specifications ?? {}) as Record<string, string>);
      setIssueOpen(false);
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  const handleSaveSpec = async () => {
    if (!detail) {
      return;
    }
    setSaving(true);
    try {
      const updated = await updateStockLotSpecApi(detail.id, specs);
      setDetail(updated);
      toastSuccess('Specifikacija lota je sačuvana');
      await loadLots();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    } finally {
      setSaving(false);
    }
  };
  const handleIssue = async () => {
    if (!detail || !employeeId || !inventoryNumber.trim()) {
      return;
    }
    setSaving(true);
    try {
      const updated = await issueStockLotUnitApi(detail.id, {
        employeeId,
        inventoryNumber: inventoryNumber.trim(),
        uniqueSpecifications: uniqueSpecs,
      });
      setDetail(updated);
      setIssueOpen(false);
      setInventoryNumber('');
      setUniqueSpecs({});
      setEmployeeId('');
      toastSuccess('Komad je izdat i zadužen');
      await loadLots();
      await refresh();
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška pri izdavanju');
    } finally {
      setSaving(false);
    }
  };
  if (selectedId && detail) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => { setSelectedId(null); setDetail(null); }}>
          Nazad na listu
        </Button>
        <PageHeader
          title={detail.productName}
          description={`${detail.warehouseName ?? ''} · ${detail.categoryName ?? ''} · ${detail.quantityOnHand}/${detail.quantityReceived} na skladištu`}
        />
        <InventoryFreezeActionHint />
        <Badge tone="neutral">{getStockLotStatusLabel(detail.status)}</Badge>
        {detail.status === 'ceka_specifikaciju' ? (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 max-w-xl">
            <h3 className="font-medium">Specifikacija lota</h3>
            {lotFields.map((field) => (
              <div key={field.id}>
                <label className={labelClass}>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={specs[field.id] ?? ''}
                    onChange={(e) => setSpecs({ ...specs, [field.id]: e.target.value })}
                    className={selectClass}
                  >
                    <option value="">—</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                    value={specs[field.id] ?? ''}
                    onChange={(e) => setSpecs({ ...specs, [field.id]: e.target.value })}
                    className={inputClass}
                  />
                )}
              </div>
            ))}
            <Button disabled={saving || isFrozen} onClick={() => void handleSaveSpec()}>
              Sačuvaj specifikaciju
            </Button>
          </div>
        ) : null}
        {detail.status === 'spremno_za_izdavanje' && detail.quantityOnHand > 0 ? (
          <div className="space-y-3">
            {!issueOpen ? (
              <Button disabled={isFrozen} onClick={() => setIssueOpen(true)}>
                Izdaj 1 komad
              </Button>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 max-w-xl">
                <h3 className="font-medium">Izdavanje komada</h3>
                <div>
                  <label className={labelClass}>Radnik *</label>
                  <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={selectClass}>
                    <option value="">— Odaberi —</option>
                    {scopedEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {getEmployeeFullName(emp)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Inventurni broj *</label>
                  <input
                    type="text"
                    value={inventoryNumber}
                    onChange={(e) => setInventoryNumber(e.target.value)}
                    className={inputClass}
                  />
                </div>
                {issueFields.map((field) => (
                  <div key={field.id}>
                    <label className={labelClass}>
                      {field.name}
                      {field.required ? ' *' : ''}
                    </label>
                    <input
                      type="text"
                      value={uniqueSpecs[field.id] ?? ''}
                      onChange={(e) => setUniqueSpecs({ ...uniqueSpecs, [field.id]: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button disabled={saving || isFrozen} onClick={() => void handleIssue()}>
                    Potvrdi izdavanje
                  </Button>
                  <Button variant="secondary" onClick={() => setIssueOpen(false)}>
                    Odustani
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
        {detail.issuedUnits && detail.issuedUnits.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <h3 className="px-4 py-2 font-medium text-gray-800 border-b bg-gray-50">Izdata oprema</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-600">
                  <th className="text-left px-4 py-2">Inv. broj</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Datum</th>
                </tr>
              </thead>
              <tbody>
                {detail.issuedUnits.map((unit) => (
                  <tr key={unit.id} className="border-t">
                    <td className="px-4 py-2 font-mono text-xs">{unit.inventoryNumber}</td>
                    <td className="px-4 py-2">{unit.status}</td>
                    <td className="px-4 py-2">{formatDate(unit.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="Skladišna roba"
        description="Definišite specifikaciju lotova i izdajte pojedinačne komade na radnike."
      />
      <InventoryFreezeActionHint />
      <div className="bg-white rounded-xl border border-gray-100 divide-y">
        {lots.map((lot) => (
          <button
            key={lot.id}
            type="button"
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
            onClick={() => void openDetail(lot.id)}
          >
            <Package size={18} className="text-blue-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{lot.productName}</p>
              <p className="text-xs text-gray-500">
                {lot.warehouseName} · {lot.quantityOnHand}/{lot.quantityReceived} ·{' '}
                {getStockLotStatusLabel(lot.status)}
              </p>
            </div>
            <ChevronRight size={16} className="text-gray-400" />
          </button>
        ))}
        {lots.length === 0 ? (
          <p className="px-4 py-10 text-center text-gray-400">Nema lotova u vašem opsegu.</p>
        ) : null}
      </div>
    </div>
  );
};
