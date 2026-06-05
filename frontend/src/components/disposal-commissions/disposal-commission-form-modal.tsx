import { useEffect, useMemo, useState } from 'react';
import { createDisposalCommissionApi } from '../../api/disposal-api';
import { ApiError } from '../../api/client';
import { getEmployeeFullName, getOrgUnitPath } from '../../helpers';
import type { City, Employee, OrgUnit } from '../../types';
import { EmployeeMultiAutocomplete } from '../employee-multi-autocomplete';
import { SearchableAutocomplete, type SearchableOption } from '../searchable-autocomplete';
import { inputClass, labelClass } from '../ui/form-styles';

interface DisposalCommissionFormModalProps {
  cities: City[];
  employees: Employee[];
  employeesWithUser: Employee[];
  orgUnits: OrgUnit[];
  citiesWithActiveCommission: ReadonlySet<string>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}

export const DisposalCommissionFormModal = ({
  cities,
  employees,
  employeesWithUser,
  orgUnits,
  citiesWithActiveCommission,
  onClose,
  onCreated,
}: DisposalCommissionFormModalProps) => {
  const [cityId, setCityId] = useState('');
  const [name, setName] = useState('');
  const [presidentId, setPresidentId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const cityOptions = useMemo((): SearchableOption[] => {
    return [...cities]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((city) => ({
        id: city.id,
        label: city.name,
        subLabel: city.canton?.name ? `${city.canton.name} (kanton)` : undefined,
        searchText: city.canton?.name ?? '',
      }));
  }, [cities]);

  const presidentOptions = useMemo((): SearchableOption[] => {
    return employeesWithUser.map((employee) => {
      const orgUnit = orgUnits.find((unit) => unit.id === employee.orgUnitId);
      const orgPath = orgUnit ? getOrgUnitPath(orgUnits, orgUnit.id) : '—';
      return {
        id: employee.id,
        label: getEmployeeFullName(employee),
        subLabel: `${employee.title || '—'} · ${orgPath}`,
        searchText: `${employee.email ?? ''} ${orgPath}`,
      };
    });
  }, [employeesWithUser, orgUnits]);

  const presidentExclude = useMemo(() => new Set(presidentId ? [presidentId] : []), [presidentId]);

  useEffect(() => {
    setMemberIds((prev) => prev.filter((id) => id !== presidentId));
  }, [presidentId]);

  const canCreate = Boolean(cityId && name.trim() && presidentId && memberIds.length >= 2);

  const handleCreate = async () => {
    if (!canCreate) {
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await createDisposalCommissionApi({
        cityId,
        name: name.trim(),
        members: [
          { employeeId: presidentId, role: 'predsjednik' },
          ...memberIds.map((employeeId) => ({ employeeId, role: 'clan' as const })),
        ],
      });
      await onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Greška pri kreiranju komisije');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCityUnavailable = Boolean(cityId && citiesWithActiveCommission.has(cityId));

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="disposal-commission-form-title"
      >
        <div className="p-6 border-b border-gray-100">
          <h2 id="disposal-commission-form-title" className="text-lg font-semibold">
            Nova komisija za rashod
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Komisija važi po gradu — rashod opreme se vezuje na grad lokacije radnika ili skladišta.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Grad *</label>
            <SearchableAutocomplete
              options={cityOptions}
              value={cityId}
              onChange={setCityId}
              emptyOption={{ id: '', label: '— Odaberite grad —' }}
              placeholder="Pretraži grad…"
              ariaLabel="Grad"
              required
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Jedna aktivna komisija po gradu. Skladišta u istom gradu dijele istu komisiju.
            </p>
            {selectedCityUnavailable ? (
              <p className="text-[11px] text-amber-700 mt-1">
                Za ovaj grad već postoji aktivna komisija.
              </p>
            ) : null}
          </div>
          <div>
            <label className={labelClass}>Naziv komisije *</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="npr. Komisija za rashod — Sarajevo"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Predsjednik *</label>
            <SearchableAutocomplete
              options={presidentOptions}
              value={presidentId}
              onChange={setPresidentId}
              emptyOption={{ id: '', label: '— Odaberite —' }}
              placeholder="Pretraži radnika s korisničkim računom…"
              ariaLabel="Predsjednik"
              required
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Predsjednik mora imati korisnički račun (za glasanje u aplikaciji).
            </p>
          </div>
          <div>
            <label className={labelClass}>Članovi (min. 2) *</label>
            <EmployeeMultiAutocomplete
              employees={employees}
              orgUnits={orgUnits}
              value={memberIds}
              onChange={setMemberIds}
              excludeIds={presidentExclude}
              placeholder="Pretraži i dodaj člana…"
              ariaLabel="Članovi komisije"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Prikaz: ime · pozicija · org. putanja. Članovi mogu biti bilo koji radnik iz registra.
            </p>
          </div>
          {error ? (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          ) : null}
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Odustani
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!canCreate || selectedCityUnavailable || isSaving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {isSaving ? 'Kreiranje…' : 'Kreiraj komisiju'}
          </button>
        </div>
      </div>
    </div>
  );
};
