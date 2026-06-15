import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  fetchCommitteeSetupOptionsApi,
  fetchInventoryCommitteesApi,
  fetchSessionWarehousesApi,
  updateInventoryCommitteeApi,
  type CommitteeSetupOptionsDto,
  type InventoryCommitteeDto,
  type InventorySessionWarehouseDto,
} from '../../api/inventory-api';
import { ApiError } from '../../api/client';
import { AlertBanner } from '../ui/alert-banner';
import { Button } from '../ui/button';
import { FormCard } from '../ui/form-card';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';

interface InventoryCommitteeWizardProps {
  sessionId: string;
  editCommittee?: InventoryCommitteeDto | null;
  onCreated: (committeeId: string) => void;
  onUpdated?: (committeeId: string) => void;
  onCancelEdit?: () => void;
}

export const InventoryCommitteeWizard = ({
  sessionId,
  editCommittee,
  onCreated,
  onUpdated,
  onCancelEdit,
}: InventoryCommitteeWizardProps) => {
  const isEdit = Boolean(editCommittee);
  const [step, setStep] = useState(1);
  const [warehouses, setWarehouses] = useState<InventorySessionWarehouseDto[]>([]);
  const [committees, setCommittees] = useState<InventoryCommitteeDto[]>([]);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState('');
  const [setupOptions, setSetupOptions] = useState<CommitteeSetupOptionsDto | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [inventoryPresidentId, setInventoryPresidentId] = useState('');
  const [inventoryMemberIds, setInventoryMemberIds] = useState<string[]>([]);
  const [disposalPresidentId, setDisposalPresidentId] = useState('');
  const [disposalMemberIds, setDisposalMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligibleEmployees = setupOptions?.eligibleEmployees ?? [];
  const employeesWithUser = useMemo(
    () => eligibleEmployees.filter((employee) => employee.hasUserAccount),
    [eligibleEmployees],
  );
  const availableCategories = useMemo(() => {
    if (isEdit && editCommittee) {
      return (setupOptions?.categories ?? []).filter(
        (row) => !row.alreadyAssigned || row.id === editCommittee.categoryId,
      );
    }
    return committees
      .filter(
        (row) =>
          row.warehouseId === warehouseId &&
          row.membersConfigured === false &&
          row.category,
      )
      .map((row) => ({
        id: row.categoryId,
        name: row.category?.name ?? row.categoryId,
        equipmentCount: 0,
        alreadyAssigned: false,
        committeeId: row.id,
      }));
  }, [committees, editCommittee, isEdit, setupOptions?.categories, warehouseId]);
  const selectedWarehouse = warehouses.find((row) => row.id === warehouseId) ?? setupOptions?.warehouse ?? null;
  const selectedCategory =
    availableCategories.find((row) => row.id === categoryId) ??
    setupOptions?.categories.find((row) => row.id === categoryId) ??
    null;

  useEffect(() => {
    if (!editCommittee) {
      return;
    }
    setWarehouseId(editCommittee.warehouseId ?? '');
    setCategoryId(editCommittee.categoryId);
    setName(editCommittee.name ?? '');
    const inventoryPresident = editCommittee.members.find((row) => row.role === 'predsjednik');
    const inventoryClerks = editCommittee.members.filter((row) => row.role === 'clan');
    setInventoryPresidentId(inventoryPresident?.employeeId ?? '');
    setInventoryMemberIds(inventoryClerks.map((row) => row.employeeId));
    const disposalPresident = editCommittee.disposalCommission?.members.find(
      (row) => row.role === 'predsjednik',
    );
    const disposalClerks = editCommittee.disposalCommission?.members.filter((row) => row.role === 'clan') ?? [];
    setDisposalPresidentId(disposalPresident?.employeeId ?? '');
    setDisposalMemberIds(disposalClerks.map((row) => row.employeeId));
    setSelectedCommitteeId(editCommittee.id);
    setStep(1);
    setError(null);
  }, [editCommittee]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [rows, committeeRows] = await Promise.all([
          fetchSessionWarehousesApi(sessionId),
          fetchInventoryCommitteesApi(sessionId),
        ]);
        if (!cancelled) {
          setWarehouses(rows);
          setCommittees(committeeRows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Greška pri učitavanju skladišta');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!warehouseId) {
      setSetupOptions(null);
      if (!isEdit) {
        setCategoryId('');
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const options = await fetchCommitteeSetupOptionsApi(
          sessionId,
          warehouseId,
          editCommittee?.id,
        );
        if (!cancelled) {
          setSetupOptions(options);
          if (!isEdit) {
            setCategoryId('');
            setInventoryPresidentId('');
            setInventoryMemberIds([]);
            setDisposalPresidentId('');
            setDisposalMemberIds([]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Greška pri učitavanju opcija');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editCommittee?.id, isEdit, sessionId, warehouseId]);

  const resetWizard = (keepWarehouse = false) => {
    setStep(1);
    if (!keepWarehouse) {
      setWarehouseId('');
      setSetupOptions(null);
    }
    setSelectedCommitteeId('');
    setName('');
    setCategoryId('');
    setInventoryPresidentId('');
    setInventoryMemberIds([]);
    setDisposalPresidentId('');
    setDisposalMemberIds([]);
    setError(null);
  };

  const handleToggleInventoryMember = (employeeId: string) => {
    if (employeeId === inventoryPresidentId) {
      return;
    }
    setInventoryMemberIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId],
    );
  };

  const handleToggleDisposalMember = (employeeId: string) => {
    if (employeeId === disposalPresidentId) {
      return;
    }
    setDisposalMemberIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId],
    );
  };

  const canNext = (): boolean => {
    if (step === 1) {
      return Boolean(warehouseId);
    }
    if (step === 2) {
      return Boolean(categoryId && selectedCommitteeId);
    }
    if (step === 3) {
      return Boolean(inventoryPresidentId) && inventoryMemberIds.length >= 2;
    }
    if (step === 4) {
      return Boolean(disposalPresidentId) && disposalMemberIds.length >= 2;
    }
    return true;
  };

  const buildPayload = () => {
    const inventoryMembers = [
      { employeeId: inventoryPresidentId, role: 'predsjednik' as const },
      ...inventoryMemberIds.map((employeeId) => ({ employeeId, role: 'clan' as const })),
    ];
    const disposalMembers = [
      { employeeId: disposalPresidentId, role: 'predsjednik' as const },
      ...disposalMemberIds.map((employeeId) => ({ employeeId, role: 'clan' as const })),
    ];
    return {
      warehouseId,
      categoryId,
      name: name.trim() || undefined,
      inventoryMembers,
      disposalMembers,
    };
  };

  const handleSave = async () => {
    const committeeId = isEdit && editCommittee ? editCommittee.id : selectedCommitteeId;
    if (!warehouseId || !categoryId || !committeeId) {
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = buildPayload();
      const updated = await updateInventoryCommitteeApi(committeeId, payload);
      if (isEdit) {
        onUpdated?.(updated.id);
        onCancelEdit?.();
      } else {
        onCreated(updated.id);
        resetWizard(true);
        setStep(2);
        const committeeRows = await fetchInventoryCommitteesApi(sessionId);
        setCommittees(committeeRows);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Greška pri snimanju');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormCard title={isEdit ? 'Uredi popisnu komisiju' : 'Dodijeli članove komisiji'}>
      <p className="text-xs text-gray-500 mb-4">
        Korak {step} / 4 — odaberite slot (skladište + kategorija) i dodijelite članove.
      </p>
      {loading ? <p className="text-xs text-gray-500 mb-3">Učitavam…</p> : null}
      {step === 1 ? (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Skladište</label>
            <select
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
              className={selectClass}
              disabled={loading}
            >
              <option value="">— Odaberite —</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>
          {!loading && warehouses.length === 0 ? (
            <AlertBanner tone="warning">
              Nema aktivnih skladišta u opsegu distribucije. Provjerite da su skladišta vezana za
              org-jedinice pod distribucijom sesije.
            </AlertBanner>
          ) : null}
          <AlertBanner tone="info">
            Odaberite skladište i kategoriju za slot koji čeka dodjelu članova.
          </AlertBanner>
        </div>
      ) : null}
      {step === 2 ? (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Kategorija opreme</label>
            <select
              value={categoryId}
              onChange={(event) => {
                const nextCategoryId = event.target.value;
                setCategoryId(nextCategoryId);
                const slot = availableCategories.find((row) => row.id === nextCategoryId);
                setSelectedCommitteeId(
                  'committeeId' in (slot ?? {}) ? String((slot as { committeeId: string }).committeeId) : '',
                );
              }}
              className={selectClass}
            >
              <option value="">— Odaberite —</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.equipmentCount > 0 ? ` (${category.equipmentCount} komada)` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Naziv komisije (opcionalno)</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                selectedWarehouse && selectedCategory
                  ? `${selectedWarehouse.name} — ${selectedCategory.name}`
                  : 'npr. Skladište — Računarska oprema'
              }
              className={inputClass}
            />
          </div>
          {availableCategories.length === 0 ? (
            <AlertBanner tone="info">
              Nema slotova koji čekaju dodjelu članova za ovo skladište.
            </AlertBanner>
          ) : null}
        </div>
      ) : null}
      {step === 3 ? (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Popisna komisija — predsjednik</label>
            <select
              value={inventoryPresidentId}
              onChange={(event) => setInventoryPresidentId(event.target.value)}
              className={selectClass}
            >
              <option value="">— Odaberite —</option>
              {employeesWithUser.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName} — {employee.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Popisna komisija — članovi (min. 2)</label>
            <div className="border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
              {eligibleEmployees
                .filter((employee) => employee.id !== inventoryPresidentId)
                .map((employee) => (
                  <label
                    key={employee.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={inventoryMemberIds.includes(employee.id)}
                      onChange={() => handleToggleInventoryMember(employee.id)}
                    />
                    {employee.firstName} {employee.lastName}
                  </label>
                ))}
            </div>
          </div>
        </div>
      ) : null}
      {step === 4 ? (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Komisija rashoda — predsjednik</label>
            <select
              value={disposalPresidentId}
              onChange={(event) => setDisposalPresidentId(event.target.value)}
              className={selectClass}
            >
              <option value="">— Odaberite —</option>
              {employeesWithUser.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName} — {employee.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Komisija rashoda — članovi (min. 2)</label>
            <div className="border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
              {eligibleEmployees
                .filter((employee) => employee.id !== disposalPresidentId)
                .map((employee) => (
                  <label
                    key={employee.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={disposalMemberIds.includes(employee.id)}
                      onChange={() => handleToggleDisposalMember(employee.id)}
                    />
                    {employee.firstName} {employee.lastName}
                  </label>
                ))}
            </div>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}
      <div className="flex justify-between gap-2 pt-2">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setStep((value) => Math.max(1, value - 1))}
            disabled={step === 1 || saving}
          >
            <ChevronLeft size={14} />
            Nazad
          </Button>
          {isEdit && onCancelEdit ? (
            <Button variant="secondary" onClick={onCancelEdit} disabled={saving}>
              Odustani
            </Button>
          ) : null}
        </div>
        {step < 4 ? (
          <Button onClick={() => setStep((value) => value + 1)} disabled={!canNext() || loading}>
            Dalje
            <ChevronRight size={14} />
          </Button>
        ) : (
          <Button onClick={() => void handleSave()} disabled={saving || !canNext()}>
            {saving ? 'Snimanje...' : isEdit ? 'Sačuvaj izmjene' : 'Dodijeli članove'}
          </Button>
        )}
      </div>
    </FormCard>
  );
};
