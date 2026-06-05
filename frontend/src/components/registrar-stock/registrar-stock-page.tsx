import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Package, ChevronRight } from 'lucide-react';
import {
  fetchAssignedStockLotsApi,
  fetchStockLotApi,
  issueStockLotUnitApi,
  updateStockLotSpecApi,
} from '../../api/warehouse-stock-api';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/toast-context';
import { formatDate, getEmployeeFullName, getOrgUnitPath } from '../../helpers';
import {
  useInventoryNumberAvailability,
  type AvailabilityStatus,
} from '../../hooks/use-equipment-availability';
import { getStockLotStatusLabel } from '../../helpers/warehouse-stock.util';
import { employeeMatchesScope } from '../../helpers/registrar-scope';
import { useStore, useRefreshData } from '../../useStore';
import { getCurrentUser } from '../../store';
import type { Category, WarehouseStockLot, WarehouseStockLotStatus } from '../../types';
import { PageHeaderRow } from '../ui/page-header-row';
import { Button } from '../ui/button';
import { cardClass, inputClass, labelClass } from '../ui/form-styles';
import { Badge, type BadgeProps } from '../ui/badge';
import { SearchableAutocomplete, type SearchableOption } from '../searchable-autocomplete';
import { AvailabilityHint } from './availability-hint';
import { CategoryFieldControl } from './category-field-control';
import { IssueUniqueFieldInput } from './issue-unique-field-input';
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

const getStatusTone = (status: WarehouseStockLotStatus): BadgeProps['tone'] => {
  if (status === 'ceka_specifikaciju') {
    return 'warning';
  }
  if (status === 'spremno_za_izdavanje') {
    return 'success';
  }
  return 'neutral';
};

const LotSectionCard = ({
  title,
  description,
  children,
  footer,
  className = '',
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) => (
  <section className={`${cardClass} border-gray-200 shadow-sm overflow-hidden ${className}`}>
    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {description ? <p className="text-xs text-gray-500 mt-1">{description}</p> : null}
    </div>
    <div className="p-5">{children}</div>
    {footer ? <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">{footer}</div> : null}
  </section>
);

const isValueAvailabilityValid = (value: string, status: AvailabilityStatus): boolean => {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  return status === 'available';
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
  const [uniqueAvailability, setUniqueAvailability] = useState<Record<string, AvailabilityStatus>>({});
  const [saving, setSaving] = useState(false);
  const inventoryAvailability = useInventoryNumberAvailability(inventoryNumber);
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
  const employeeSearchOptions = useMemo((): SearchableOption[] => {
    return scopedEmployees.map((employee) => {
      const orgUnit = state.orgUnits.find((unit) => unit.id === employee.orgUnitId);
      const orgPath = orgUnit ? getOrgUnitPath(state.orgUnits, orgUnit.id) : '—';
      return {
        id: employee.id,
        label: getEmployeeFullName(employee),
        subLabel: `${employee.title || '—'} · ${orgPath}`,
        searchText: `${employee.email ?? ''} ${orgPath}`,
      };
    });
  }, [scopedEmployees, state.orgUnits]);
  const canSubmitIssue = useMemo(() => {
    if (!employeeId || !inventoryNumber.trim()) {
      return false;
    }
    if (!isValueAvailabilityValid(inventoryNumber, inventoryAvailability)) {
      return false;
    }
    for (const field of issueFields) {
      const value = uniqueSpecs[field.id] ?? '';
      if (field.required && !value.trim()) {
        return false;
      }
      if (!isValueAvailabilityValid(value, uniqueAvailability[field.id] ?? 'idle')) {
        return false;
      }
    }
    return true;
  }, [
    employeeId,
    inventoryAvailability,
    inventoryNumber,
    issueFields,
    uniqueAvailability,
    uniqueSpecs,
  ]);
  const handleUniqueAvailabilityChange = useCallback((fieldId: string, status: AvailabilityStatus) => {
    setUniqueAvailability((prev) => ({ ...prev, [fieldId]: status }));
  }, []);
  const openIssueForm = () => {
    setIssueOpen(true);
    setUniqueAvailability({});
    setUniqueSpecs({});
    setInventoryNumber('');
    setEmployeeId('');
  };
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
      <div className="space-y-5">
        <section className={`${cardClass} border-gray-200 shadow-sm overflow-hidden`}>
          <div className="px-5 py-4 bg-gradient-to-r from-slate-50 via-white to-blue-50/40">
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setDetail(null);
              }}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft size={16} />
              Nazad na listu
            </button>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{detail.productName}</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {detail.warehouseName ?? '—'} · {detail.categoryName ?? '—'}
                </p>
              </div>
              <Badge tone={getStatusTone(detail.status)}>{getStockLotStatusLabel(detail.status)}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-white border border-gray-200 px-3 py-1 text-xs text-gray-600">
                Na skladištu: <span className="ml-1 font-semibold text-gray-900">{detail.quantityOnHand}/{detail.quantityReceived}</span>
              </span>
              {detail.contractNumber ? (
                <span className="inline-flex items-center rounded-full bg-white border border-gray-200 px-3 py-1 text-xs text-gray-600">
                  Ugovor: <span className="ml-1 font-medium text-gray-800">{detail.contractNumber}</span>
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <InventoryFreezeActionHint />

        {detail.status === 'ceka_specifikaciju' ? (
          <LotSectionCard
            title="Specifikacija lota"
            description="Popunite zajedničke karakteristike za cijeli lot prije izdavanja pojedinačnih komada."
            footer={
              <div className="flex justify-end">
                <Button disabled={saving || isFrozen} onClick={() => void handleSaveSpec()}>
                  Sačuvaj specifikaciju
                </Button>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lotFields.map((field) => (
                <CategoryFieldControl
                  key={field.id}
                  field={field}
                  value={specs[field.id] ?? ''}
                  onChange={(next) => setSpecs({ ...specs, [field.id]: next })}
                />
              ))}
            </div>
          </LotSectionCard>
        ) : null}

        {detail.status === 'spremno_za_izdavanje' && detail.quantityOnHand > 0 ? (
          !issueOpen ? (
            <div className="flex justify-start">
              <Button disabled={isFrozen} onClick={openIssueForm}>
                Izdaj 1 komad
              </Button>
            </div>
          ) : (
            <LotSectionCard
              title="Izdavanje komada"
              description="Dodijelite inventurni broj i unikatne podatke za jedan komad iz lota."
              footer={
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" onClick={() => setIssueOpen(false)}>
                    Odustani
                  </Button>
                  <Button disabled={saving || isFrozen || !canSubmitIssue} onClick={() => void handleIssue()}>
                    Potvrdi izdavanje
                  </Button>
                </div>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Radnik *</label>
                  <SearchableAutocomplete
                    options={employeeSearchOptions}
                    value={employeeId}
                    onChange={setEmployeeId}
                    emptyOption={{ id: '', label: '— Odaberi —' }}
                    placeholder="Pretraži radnika…"
                    ariaLabel="Radnik"
                    required
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Prikaz: ime · pozicija · org. putanja.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Inventurni broj *</label>
                  <input
                    type="text"
                    value={inventoryNumber}
                    onChange={(event) => setInventoryNumber(event.target.value)}
                    className={inputClass}
                  />
                  <AvailabilityHint status={inventoryAvailability} />
                </div>
                {issueFields.map((field) => (
                  <IssueUniqueFieldInput
                    key={field.id}
                    categoryId={detail.categoryId}
                    field={field}
                    value={uniqueSpecs[field.id] ?? ''}
                    onChange={(next) => setUniqueSpecs({ ...uniqueSpecs, [field.id]: next })}
                    onAvailabilityChange={handleUniqueAvailabilityChange}
                  />
                ))}
              </div>
            </LotSectionCard>
          )
        ) : null}

        {detail.issuedUnits && detail.issuedUnits.length > 0 ? (
          <LotSectionCard title="Izdata oprema" description="Pregled komada izdatih iz ovog lota.">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="px-3 py-2 font-medium">Inv. broj</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.issuedUnits.map((unit) => (
                    <tr key={unit.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/80">
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-800">{unit.inventoryNumber}</td>
                      <td className="px-3 py-2.5 text-gray-600">{unit.status}</td>
                      <td className="px-3 py-2.5 text-gray-600">{formatDate(unit.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </LotSectionCard>
        ) : null}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageHeaderRow
        title="Skladišna roba"
        description="Definišite specifikaciju lotova i izdajte pojedinačne komade na radnike."
      />
      <InventoryFreezeActionHint />
      <div className={`${cardClass} border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden`}>
        {lots.map((lot) => (
          <button
            key={lot.id}
            type="button"
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
            onClick={() => void openDetail(lot.id)}
          >
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Package size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{lot.productName}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {lot.warehouseName} · {lot.quantityOnHand}/{lot.quantityReceived} na skladištu
              </p>
            </div>
            <Badge tone={getStatusTone(lot.status)}>{getStockLotStatusLabel(lot.status)}</Badge>
            <ChevronRight size={16} className="text-gray-400 shrink-0" />
          </button>
        ))}
        {lots.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-gray-400">Nema lotova u vašem opsegu.</p>
        ) : null}
      </div>
    </div>
  );
};
