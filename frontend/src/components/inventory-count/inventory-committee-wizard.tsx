import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createInventoryCommitteeApi } from '../../api/inventory-api';
import { ApiError } from '../../api/client';
import { getParentCategories } from '../../store';
import type { AppState } from '../../types';
import { AlertBanner } from '../ui/alert-banner';
import { Button } from '../ui/button';
import { FormCard } from '../ui/form-card';
import { inputClass, labelClass, selectClass } from '../ui/form-styles';

interface InventoryCommitteeWizardProps {
  state: AppState;
  sessionId: string;
  onCreated: (committeeId: string) => void;
}

export const InventoryCommitteeWizard = ({ state, sessionId, onCreated }: InventoryCommitteeWizardProps) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [inventoryPresidentId, setInventoryPresidentId] = useState('');
  const [inventoryMemberIds, setInventoryMemberIds] = useState<string[]>([]);
  const [disposalPresidentId, setDisposalPresidentId] = useState('');
  const [disposalMemberIds, setDisposalMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parentCategories = getParentCategories();
  const employeesWithUser = useMemo(() => {
    const linked = new Set(
      state.users.filter((user) => user.isActive && user.employeeId).map((user) => user.employeeId!),
    );
    return state.employees.filter((employee) => linked.has(employee.id));
  }, [state.users, state.employees]);
  const allEmployees = state.employees;
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
      return Boolean(categoryId);
    }
    if (step === 2) {
      return Boolean(inventoryPresidentId) && inventoryMemberIds.length >= 2;
    }
    if (step === 3) {
      return Boolean(disposalPresidentId) && disposalMemberIds.length >= 2;
    }
    return true;
  };
  const handleCreate = async () => {
    setError(null);
    setSaving(true);
    try {
      const inventoryMembers = [
        { employeeId: inventoryPresidentId, role: 'predsjednik' as const },
        ...inventoryMemberIds.map((employeeId) => ({ employeeId, role: 'clan' as const })),
      ];
      const disposalMembers = [
        { employeeId: disposalPresidentId, role: 'predsjednik' as const },
        ...disposalMemberIds.map((employeeId) => ({ employeeId, role: 'clan' as const })),
      ];
      const created = await createInventoryCommitteeApi(sessionId, {
        categoryId,
        name: name.trim() || undefined,
        inventoryMembers,
        disposalMembers,
      });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Greška pri kreiranju');
    } finally {
      setSaving(false);
    }
  };
  return (
    <FormCard title="Dodaj komisiju u sesiju popisa">
      <p className="text-xs text-gray-500 mb-4">
        Korak {step} / 4 — popisna komisija (unos) i komisija rashoda (glasanje) su odvojene.
      </p>
      {step === 1 ? (
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Kategorija (jedna)</label>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={selectClass}
            >
              <option value="">— Odaberite —</option>
              {parentCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Naziv komisije (opcionalno)</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="npr. Komisija — Računarska oprema"
              className={inputClass}
            />
          </div>
          <AlertBanner tone="info">
            Predsjednik mora imati korisnički račun; članovi mogu biti samo zaposlenici (bez računa).
          </AlertBanner>
        </div>
      ) : null}
      {step === 2 ? (
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
              {allEmployees
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
      {step === 3 ? (
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
              {allEmployees
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
      {step === 4 ? (
        <div className="text-sm text-gray-700 space-y-2">
          <p>
            <strong>Kategorija:</strong>{' '}
            {parentCategories.find((row) => row.id === categoryId)?.name ?? '—'}
          </p>
          <p>
            <strong>Naziv:</strong> {name.trim() || '—'}
          </p>
          <p>
            <strong>Popis:</strong> 1 predsjednik + {inventoryMemberIds.length} člana
          </p>
          <p>
            <strong>Rashod:</strong> 1 predsjednik + {disposalMemberIds.length} člana
          </p>
          <AlertBanner tone="info">
            Nakon kreiranja, unos linija popisa je moguć samo članovima popisne komisije (administrator ne unosi).
          </AlertBanner>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex justify-between gap-2 pt-2">
        <Button
          variant="secondary"
          onClick={() => setStep((value) => Math.max(1, value - 1))}
          disabled={step === 1 || saving}
        >
          <ChevronLeft size={14} />
          Nazad
        </Button>
        {step < 4 ? (
          <Button onClick={() => setStep((value) => value + 1)} disabled={!canNext()}>
            Dalje
            <ChevronRight size={14} />
          </Button>
        ) : (
          <Button onClick={() => void handleCreate()} disabled={saving || !canNext()}>
            {saving ? 'Kreiranje...' : 'Kreiraj popis'}
          </Button>
        )}
      </div>
    </FormCard>
  );
};
