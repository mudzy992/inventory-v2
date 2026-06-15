import { useEffect, useMemo, useState } from 'react';
import { fetchEmployeesPageApi } from '../api/employees-api';
import { fetchAllPaginatedItems } from '../api/fetch-all-paginated';
import type { Employee } from '../types';
import { useStore, useRefreshData } from '../useStore';
import { createOrgUnitApi, deleteOrgUnitApi, updateOrgUnitApi } from '../api/data-api';
import { ApiError } from '../api/client';
import { canDeleteOrgUnit } from '../helpers/guards';
import { getApiErrorMessage, refreshAfterMutation } from '../helpers/run-mutation-with-refresh.util';
import { useToast } from '../contexts/toast-context';
import { ChevronDown, ChevronRight, Building2, Plus, Edit2, Trash2, Users, Shield } from 'lucide-react';
import {
  getCityLabel,
  getEffectiveCityForOrgUnit,
  getEffectiveSignerForOrgUnit,
  getOrgUnitPath,
  getOrgUnitTypeLabel,
} from '../helpers';
import { getOrgSubtreeIds, resolveEffectiveWarehouseForOrgUnit } from '../helpers/org-warehouse.util';
import {
  ALL_ORG_UNIT_TYPE_OPTIONS,
  getCreatableOrgUnitTypes,
  canUseRootParent,
  isAllowedOrgUnitParentChild,
} from '../helpers/org-hierarchy.util';
import { cn } from '../utils/cn';
import type { OrgUnit, OrgUnitType } from '../types';
import { OrgUnitWarehousesSection } from './organization/org-unit-warehouses-section';
import { SearchableAutocomplete, type SearchableOption } from './searchable-autocomplete';
import { PageHeaderRow } from './ui/page-header-row';
import { ModalRoot } from './ui/modal-root';

const PARENT_ROOT_ID = '__parent_root__';
const SIGNER_INHERIT_ID = '__inherit_signer__';
const CITY_INHERIT_ID = '__inherit_city__';

function OrgTreeNode({ unit, level, state, employees, onEdit, onDelete, onAdd }: {
  unit: OrgUnit;
  level: number;
  state: ReturnType<typeof useStore>[0];
  employees: Employee[];
  onEdit: (unit: OrgUnit) => void;
  onDelete: (id: string) => void;
  onAdd: (parentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(level === 0);
  const children = state.orgUnits.filter(o => o.parentId === unit.id);
  const unitEmployees = employees.filter(e => e.orgUnitId === unit.id);
  const explicitSigner = unit.signerId ? employees.find((e) => e.id === unit.signerId) : null;
  const effectiveSigner = getEffectiveSignerForOrgUnit(state.orgUnits, employees, unit.id);
  const inheritedSigner =
    effectiveSigner && effectiveSigner.id !== unit.signerId ? effectiveSigner : null;
  const hasChildren = children.length > 0;

  const typeColors: Record<string, string> = {
    direkcija: 'border-l-blue-600 bg-blue-50',
    distribucija: 'border-l-purple-600 bg-purple-50',
    podrucje: 'border-l-teal-600 bg-teal-50',
    podruznica: 'border-l-orange-600 bg-orange-50',
    poslovna_jedinica: 'border-l-indigo-600 bg-indigo-50',
    sektor: 'border-l-green-600 bg-green-50',
    sluzba: 'border-l-yellow-600 bg-yellow-50',
    odjeljenje: 'border-l-gray-600 bg-gray-50',
  };

  const badgeColors: Record<string, string> = {
    direkcija: 'bg-blue-100 text-blue-700',
    distribucija: 'bg-purple-100 text-purple-700',
    podrucje: 'bg-teal-100 text-teal-700',
    podruznica: 'bg-orange-100 text-orange-700',
    poslovna_jedinica: 'bg-indigo-100 text-indigo-700',
    sektor: 'bg-green-100 text-green-700',
    sluzba: 'bg-yellow-100 text-yellow-700',
    odjeljenje: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className={cn('ml-0', level > 0 && 'ml-3 sm:ml-6')}>
      <div className={cn(
        'border-l-4 rounded-r-lg mb-1 transition-colors',
        typeColors[unit.type] || 'border-l-gray-300 bg-gray-50'
      )}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 group">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0 w-5"
          >
            {hasChildren || unitEmployees.length > 0
              ? (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />)
              : <span className="w-4" />
            }
          </button>
          <Building2 size={16} className="text-gray-400 flex-shrink-0" />
          <span className="font-medium text-sm text-gray-800 flex-1">{unit.name}</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', badgeColors[unit.type] || 'bg-gray-100 text-gray-600')}>
            {getOrgUnitTypeLabel(unit.type)}
          </span>
          {explicitSigner && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 flex items-center gap-1">
              <Shield size={10} /> {explicitSigner.firstName} {explicitSigner.lastName}
            </span>
          )}
          {!explicitSigner && inheritedSigner && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex items-center gap-1">
              <Shield size={10} /> {inheritedSigner.firstName} {inheritedSigner.lastName} (nasl.)
            </span>
          )}
          <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
            <Users size={10} />{unitEmployees.length}
          </span>
          <div className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 flex gap-1 transition-opacity ml-auto">
            <button onClick={() => onAdd(unit.id)} className="text-green-500 hover:text-green-700 p-0.5" title="Dodaj podjedinicu">
              <Plus size={14} />
            </button>
            <button onClick={() => onEdit(unit)} className="text-blue-500 hover:text-blue-700 p-0.5" title="Uredi">
              <Edit2 size={14} />
            </button>
            {children.length === 0 && unitEmployees.length === 0 && (
              <button onClick={() => onDelete(unit.id)} className="text-red-500 hover:text-red-700 p-0.5" title="Obriši">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        {expanded && unitEmployees.length > 0 && (
          <div className="px-10 pb-2">
            {unitEmployees.map(emp => (
              <div key={emp.id} className="flex items-center gap-2 text-xs text-gray-500 py-0.5">
                <Users size={12} className="text-gray-300" />
                <span className="text-gray-700">{emp.firstName} {emp.lastName}</span>
                <span className="text-gray-400">— {emp.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {expanded && children.map(child => (
        <OrgTreeNode key={child.id} unit={child} level={level + 1} state={state} employees={employees} onEdit={onEdit} onDelete={onDelete} onAdd={onAdd} />
      ))}
    </div>
  );
}

export function OrganizationPage() {
  const [state, setState] = useStore();
  const refresh = useRefreshData();
  const { toastError, toastSuccess } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [editingUnit, setEditingUnit] = useState<OrgUnit | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formParentId, setFormParentId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<OrgUnitType>('sektor');
  const [formSignerId, setFormSignerId] = useState('');
  const [formLocationCityId, setFormLocationCityId] = useState('');

  useEffect(() => {
    void fetchAllPaginatedItems((params) => fetchEmployeesPageApi(params), 100)
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);

  const rootUnits = state.orgUnits.filter(o => o.parentId === null);
  const hasDirekcija = state.orgUnits.some((unit) => unit.type === 'direkcija');
  const isCreate = !editingUnit;

  const formTypeOptions = useMemo((): readonly OrgUnitType[] => {
    if (editingUnit) {
      return ALL_ORG_UNIT_TYPE_OPTIONS;
    }
    if (!hasDirekcija) {
      return ['direkcija'];
    }
    return ALL_ORG_UNIT_TYPE_OPTIONS;
  }, [editingUnit, hasDirekcija]);

  const excludeParentIds = useMemo(() => {
    if (!editingUnit) {
      return undefined;
    }
    const ids = getOrgSubtreeIds(state.orgUnits, editingUnit.id);
    ids.add(editingUnit.id);
    return ids;
  }, [editingUnit, state.orgUnits]);

  const resolvedFormType = formTypeOptions.includes(formType)
    ? formType
    : (formTypeOptions[0] ?? formType);

  const parentOrgOptions = useMemo((): SearchableOption[] => {
    const mapUnit = (unit: OrgUnit): SearchableOption => {
      const path = getOrgUnitPath(state.orgUnits, unit.id);
      const prefix = `${unit.name} → `;
      const parentPath = path.startsWith(prefix) ? path.slice(prefix.length) : path === unit.name ? '' : path;
      const subLabel = parentPath
        ? `${getOrgUnitTypeLabel(unit.type)} · ${parentPath}`
        : getOrgUnitTypeLabel(unit.type);
      return {
        id: unit.id,
        label: unit.name,
        subLabel,
        searchText: `${getOrgUnitTypeLabel(unit.type)} ${path}`,
      };
    };
    return state.orgUnits
      .filter((unit) => {
        if (excludeParentIds?.has(unit.id)) {
          return false;
        }
        return isAllowedOrgUnitParentChild(unit.type, resolvedFormType);
      })
      .map(mapUnit);
  }, [state.orgUnits, resolvedFormType, excludeParentIds]);

  const signerScopeOrgIds = useMemo(() => {
    if (formParentId) {
      return getOrgSubtreeIds(state.orgUnits, formParentId);
    }
    if (editingUnit) {
      return getOrgSubtreeIds(state.orgUnits, editingUnit.id);
    }
    return null;
  }, [formParentId, editingUnit, state.orgUnits]);

  const employeeOptions = useMemo((): SearchableOption[] =>
    employees
      .filter((emp) => !signerScopeOrgIds || signerScopeOrgIds.has(emp.orgUnitId))
      .map((emp) => {
        const orgUnit = state.orgUnits.find((unit) => unit.id === emp.orgUnitId);
        const orgPath = orgUnit ? getOrgUnitPath(state.orgUnits, orgUnit.id) : '—';
        return {
          id: emp.id,
          label: `${emp.firstName} ${emp.lastName}`,
          subLabel: `${emp.title || '—'} · ${orgPath}`,
          searchText: `${emp.email ?? ''} ${orgPath}`,
        };
      }),
  [employees, state.orgUnits, signerScopeOrgIds]);

  const cityOptions = useMemo((): SearchableOption[] =>
    state.cities.map((city) => ({
      id: city.id,
      label: city.name,
      subLabel: city.canton?.name ? `${city.canton.name} (kanton)` : undefined,
      searchText: `${city.name} ${city.canton?.name ?? ''}`,
    })),
  [state.cities]);

  const effectiveMeta = useMemo(() => {
    const anchorId = editingUnit?.id ?? formParentId;
    if (!anchorId) {
      return null;
    }
    const effectiveCityId = getEffectiveCityForOrgUnit(state.orgUnits, anchorId);
    const effectiveSigner = getEffectiveSignerForOrgUnit(
      state.orgUnits,
      employees,
      anchorId,
    );
    const effectiveWarehouseId = resolveEffectiveWarehouseForOrgUnit(
      state.orgUnits,
      state.warehouses,
      anchorId,
      effectiveCityId,
    );
    const effectiveWarehouse = effectiveWarehouseId
      ? state.warehouses.find((row) => row.id === effectiveWarehouseId)
      : null;
    return {
      location: getCityLabel(state.cities, effectiveCityId),
      signer: effectiveSigner
        ? `${effectiveSigner.firstName} ${effectiveSigner.lastName}`
        : '— nije konfigurisan u hijerarhiji',
      warehouse: effectiveWarehouse?.name ?? '— nije dodijeljeno',
      inheritedFrom: editingUnit
        ? 'Efektivne vrijednosti ove jedinice (ako polja ostavite prazna, nasljeđuje se od nadređene).'
        : 'Vrijednosti koje nasljeđuje nova jedinica od odabrane nadređene (ako polja ostavite prazna).',
    };
  }, [editingUnit, employees, formParentId, state]);

  const inheritAnchorId = editingUnit?.id ?? formParentId;

  const inheritSignerOption = useMemo((): SearchableOption => {
    if (!inheritAnchorId) {
      return {
        id: SIGNER_INHERIT_ID,
        label: '— Nasljeđuje od nadređene (podrazumijevano) —',
        subLabel: 'Odaberite nadređenu jedinicu da vidite tko se nasljeđuje',
      };
    }
    const effective = getEffectiveSignerForOrgUnit(state.orgUnits, employees, inheritAnchorId);
    return {
      id: SIGNER_INHERIT_ID,
      label: '— Nasljeđuje od nadređene (podrazumijevano) —',
      subLabel: effective
        ? `Nasljedeće: ${effective.firstName} ${effective.lastName}`
        : 'Nije postavljen u hijerarhiji nadređene',
    };
  }, [employees, inheritAnchorId, state.orgUnits]);

  const inheritCityOption = useMemo((): SearchableOption => {
    if (!inheritAnchorId) {
      return {
        id: CITY_INHERIT_ID,
        label: '— Nasljeđuje od nadređene (podrazumijevano) —',
        subLabel: 'Odaberite nadređenu jedinicu da vidite koji grad se nasljeđuje',
      };
    }
    const effectiveCityId = getEffectiveCityForOrgUnit(state.orgUnits, inheritAnchorId);
    return {
      id: CITY_INHERIT_ID,
      label: '— Nasljeđuje od nadređene (podrazumijevano) —',
      subLabel: effectiveCityId
        ? `Nasljedeće: ${getCityLabel(state.cities, effectiveCityId)}`
        : 'Lokacija nije postavljena na nadređenoj',
    };
  }, [inheritAnchorId, state.orgUnits, state.cities]);

  const resetInheritedFields = () => {
    setFormSignerId('');
    setFormLocationCityId('');
  };

  const openCreate = () => {
    setEditingUnit(null);
    setFormParentId(null);
    setFormName('');
    setFormType(hasDirekcija ? 'sektor' : 'direkcija');
    setFormSignerId('');
    setFormLocationCityId('');
    setShowForm(true);
  };

  function openAdd(parentId: string) {
    const parentType = state.orgUnits.find((unit) => unit.id === parentId)?.type ?? null;
    const allowed = getCreatableOrgUnitTypes(parentId, parentType);
    setEditingUnit(null);
    setFormParentId(parentId);
    setFormName('');
    setFormType(allowed[0] ?? 'sektor');
    setFormSignerId('');
    setFormLocationCityId('');
    setShowForm(true);
  }

  function openEdit(unit: OrgUnit) {
    setEditingUnit(unit);
    setFormParentId(unit.parentId);
    setFormName(unit.name);
    setFormType(unit.type);
    setFormSignerId(unit.signerId || '');
    setFormLocationCityId(unit.locationCityId || '');
    setShowForm(true);
  }

  const handleTypeChange = (nextType: OrgUnitType) => {
    setFormType(nextType);
    if (formParentId) {
      const parent = state.orgUnits.find((unit) => unit.id === formParentId);
      if (parent && !isAllowedOrgUnitParentChild(parent.type, nextType)) {
        setFormParentId(null);
        resetInheritedFields();
      }
    }
    if (!canUseRootParent(nextType) && !formParentId) {
      resetInheritedFields();
    }
  };

  const handleParentChange = (rawParentId: string) => {
    const nextParentId = rawParentId === PARENT_ROOT_ID ? null : rawParentId;
    if (nextParentId) {
      const parent = state.orgUnits.find((unit) => unit.id === nextParentId);
      if (parent && !isAllowedOrgUnitParentChild(parent.type, resolvedFormType)) {
        return;
      }
    } else if (!canUseRootParent(resolvedFormType)) {
      return;
    }
    setFormParentId(nextParentId);
    resetInheritedFields();
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    const saveType = formTypeOptions.includes(formType) ? formType : (formTypeOptions[0] ?? formType);
    if (isCreate) {
      if (!hasDirekcija) {
        if (saveType !== 'direkcija' || formParentId) {
          toastError('Prvo kreirajte Direkciju na krovnom nivou (bez nadređene jedinice).');
          return;
        }
      } else if (!formParentId && saveType !== 'direkcija') {
        toastError('Na krovnom nivou dozvoljena je samo Direkcija. Odaberite nadređenu jedinicu.');
        return;
      } else if (formParentId) {
        const parent = state.orgUnits.find((unit) => unit.id === formParentId);
        if (parent && !isAllowedOrgUnitParentChild(parent.type, saveType)) {
          const allowed = getCreatableOrgUnitTypes(formParentId, parent.type)
            .map(getOrgUnitTypeLabel)
            .join(', ');
          toastError(
            `Tip „${getOrgUnitTypeLabel(saveType)}” nije dozvoljen ispod „${getOrgUnitTypeLabel(parent.type)}”. Dozvoljeno: ${allowed}.`,
          );
          return;
        }
      }
    }
    setIsSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        type: saveType,
        parentId: formParentId,
        signerId: formSignerId || null,
        locationCityId: formLocationCityId || null,
      };
      if (editingUnit) {
        const updated = await updateOrgUnitApi(editingUnit.id, payload);
        setState((prev) => ({
          ...prev,
          orgUnits: prev.orgUnits.map((unit) =>
            unit.id === updated.id ? { ...unit, ...updated } : unit,
          ),
        }));
        toastSuccess('Organizacijska jedinica je ažurirana.');
      } else {
        const created = await createOrgUnitApi(payload);
        setState((prev) => ({
          ...prev,
          orgUnits: [...prev.orgUnits, created],
        }));
        toastSuccess('Organizacijska jedinica je dodana.');
      }
      setEditingUnit(null);
      setShowForm(false);
      void refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri spremanju';
      toastError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const guard = canDeleteOrgUnit(id, state.orgUnits, employees);
    if (!guard.allowed) {
      toastError(guard.reason ?? 'Brisanje nije dozvoljeno.');
      return;
    }
    if (!confirm('Da li ste sigurni da želite obrisati ovu organizacijsku jedinicu?')) return;
    try {
      await deleteOrgUnitApi(id);
      toastSuccess('Organizacijska jedinica je obrisana.');
      await refreshAfterMutation([refresh]);
    } catch (err) {
      toastError(getApiErrorMessage(err, 'Greška pri brisanju'));
    }
  };

  return (
    <div>
      <PageHeaderRow
        title="Organizacijska struktura"
        description="Hijerarhija preduzeća — direkcija, distribucije, područja, podružnice"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus size={16} /> Nova jedinica
          </button>
        }
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {rootUnits.map(unit => (
          <OrgTreeNode key={unit.id} unit={unit} level={0} state={state} employees={employees} onEdit={openEdit} onDelete={handleDelete} onAdd={openAdd} />
        ))}
        {rootUnits.length === 0 && (
          <p className="text-center text-gray-400 py-12">Nema organizacijskih jedinica. Dodajte prvu.</p>
        )}
      </div>

      {showForm && (
        <ModalRoot open onClose={() => setShowForm(false)} size="lg" panelClassName="bg-white shadow-xl max-w-lg">
          <div className="bg-white rounded-t-xl sm:rounded-xl w-full max-h-[90dvh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">
                {editingUnit ? 'Uredi organizacijsku jedinicu' : 'Nova organizacijska jedinica'}
              </h2>
              {isCreate && !hasDirekcija ? (
                <p className="text-xs text-amber-700 mt-1 rounded-md bg-amber-50 border border-amber-100 px-2 py-1.5">
                  Prvo kreirajte Direkciju na krovnom nivou. Zatim možete dodavati ostale tipove ispod nje.
                </p>
              ) : null}
              {isCreate && hasDirekcija ? (
                <p className="text-xs text-gray-500 mt-1">
                  Odaberite nadređenu jedinicu i tip prema hijerarhiji. Na krovnom nivou dozvoljena je samo Direkcija.
                </p>
              ) : null}
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Naziv</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Npr. Sektor za IT"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tip</label>
                <select
                  value={resolvedFormType}
                  onChange={e => handleTypeChange(e.target.value as OrgUnitType)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {formTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {getOrgUnitTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nadređena jedinica</label>
                <SearchableAutocomplete
                  options={parentOrgOptions}
                  value={formParentId ?? PARENT_ROOT_ID}
                  onChange={handleParentChange}
                  excludeIds={excludeParentIds}
                  emptyOption={
                    canUseRootParent(resolvedFormType)
                      ? {
                          id: PARENT_ROOT_ID,
                          label: '— Krovni nivo (nema nadređenu) —',
                          subLabel: 'Samo za tip Direkcija',
                        }
                      : undefined
                  }
                  placeholder="Pretraži nadređenu jedinicu…"
                  ariaLabel="Nadređena jedinica"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Prikaz: naziv · tip · putanja. Filtrirano prema odabranom tipu ({getOrgUnitTypeLabel(resolvedFormType)}).
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Potpisnik (ovlaštena osoba)</label>
                <SearchableAutocomplete
                  options={employeeOptions}
                  value={formSignerId ? formSignerId : SIGNER_INHERIT_ID}
                  onChange={(id) => setFormSignerId(id === SIGNER_INHERIT_ID ? '' : id)}
                  emptyOption={inheritSignerOption}
                  placeholder="Pretraži za ručni odabir potpisnika…"
                  ariaLabel="Potpisnik"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Podrazumijevano: nasljeđivanje. Ispod: ručni odabir (ime · pozicija · org. putanja).
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lokacija (grad)</label>
                <SearchableAutocomplete
                  options={cityOptions}
                  value={formLocationCityId ? formLocationCityId : CITY_INHERIT_ID}
                  onChange={(id) => setFormLocationCityId(id === CITY_INHERIT_ID ? '' : id)}
                  emptyOption={inheritCityOption}
                  placeholder="Pretraži za ručni odabir grada…"
                  ariaLabel="Lokacija"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Podrazumijevano: nasljeđivanje. Ispod: ručni odabir (grad · kanton).
                </p>
              </div>
              {effectiveMeta ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 space-y-1 text-xs text-gray-500">
                  <p className="text-gray-400">{effectiveMeta.inheritedFrom}</p>
                  <p>
                    Efektivna lokacija: <span className="font-medium text-gray-700">{effectiveMeta.location}</span>
                  </p>
                  <p>
                    Efektivni potpisnik: <span className="font-medium text-gray-700">{effectiveMeta.signer}</span>
                  </p>
                  <p>
                    Efektivno skladište: <span className="font-medium text-gray-700">{effectiveMeta.warehouse}</span>
                  </p>
                </div>
              ) : null}
              {editingUnit ? <OrgUnitWarehousesSection orgUnit={editingUnit} /> : null}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Odustani
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Spremanje…' : editingUnit ? 'Sačuvaj izmjene' : 'Dodaj'}
              </button>
            </div>
          </div>
        </ModalRoot>
      )}
    </div>
  );
}
