import { useState, useMemo, useCallback, useEffect } from 'react';
import { useStore, useRefreshData } from '../useStore';
import { createEmployeeApi, deleteEmployeeApi, updateEmployeeApi } from '../api/data-api';
import { fetchEmployeesPageApi } from '../api/employees-api';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { previewRelocationApi, type RelocationPreview } from '../api/employee-relocation-api';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/toast-context';
import { isAdmin, isEvidenticar, getCurrentUser } from '../store';
import { Plus, Edit2, Trash2, Search, Package } from 'lucide-react';
import { getOrgUnitPath, getOrgUnitTypeLabel } from '../helpers';
import { EmployeeTitleAutocomplete } from './employee-title-autocomplete';
import { resolveCanonicalEmployeeTitle } from './employee-title-suggestions';
import { OrgUnitAutocomplete } from './org-unit-autocomplete';
import type { Employee } from '../types';
import { PageHeaderRow } from './ui/page-header-row';
import { ResponsiveTable } from './ui/responsive-table';
import { PaginationControls } from './ui/pagination-controls';
import { ModalRoot } from './ui/modal-root';

export function EmployeesPage() {
  const [state] = useStore();
  const refresh = useRefreshData();
  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const user = getCurrentUser();
  const { toastError } = useToast();
  const [filterOrgUnit, setFilterOrgUnit] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const [fFirstName, setFFirstName] = useState('');
  const [fLastName, setFLastName] = useState('');
  const [fTitle, setFTitle] = useState('');
  const [fOrgUnit, setFOrgUnit] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [relocationPreview, setRelocationPreview] = useState<RelocationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const list = usePaginatedList<Employee, { orgUnitId?: string }>({
    fetchPage: fetchEmployeesPageApi,
    initialFilters: { orgUnitId: undefined },
  });

  useEffect(() => {
    list.setFilters({ orgUnitId: filterOrgUnit || undefined });
  }, [filterOrgUnit, list.setFilters]);

  const filtered = list.items;
  const search = list.search;
  const setSearch = list.setSearch;

  const scopedOrgUnits = useMemo(() => state.orgUnits, [state.orgUnits]);

  function openAdd() {
    setEditing(null);
    setFFirstName('');
    setFLastName('');
    setFTitle('');
    setFOrgUnit(state.orgUnits[0]?.id || '');
    setFEmail('');
    setFPhone('');
    setShowForm(true);
  }

  function openEdit(emp: Employee) {
    setEditing(emp);
    setFFirstName(emp.firstName);
    setFLastName(emp.lastName);
    setFTitle(emp.title);
    setFOrgUnit(emp.orgUnitId);
    setFEmail(emp.email || '');
    setFPhone(emp.phone || '');
    setShowForm(true);
  }

  const persistEmployee = async () => {
    const payload = {
      firstName: fFirstName.trim(),
      lastName: fLastName.trim(),
      title: resolveCanonicalEmployeeTitle([], fTitle).trim(),
      orgUnitId: fOrgUnit,
      email: fEmail || undefined,
      phone: fPhone || undefined,
    };
    if (editing) {
      await updateEmployeeApi(editing.id, payload);
    } else {
      await createEmployeeApi(payload);
    }
    await refresh();
    await list.refresh();
    setShowForm(false);
    setRelocationPreview(null);
  };

  const handleSave = async () => {
    if (!admin) {
      toastError('Samo administrator može mijenjati zaposlenike.');
      return;
    }
    if (!fFirstName.trim() || !fLastName.trim() || !fOrgUnit) return;
    try {
      if (editing && editing.orgUnitId !== fOrgUnit) {
        setPreviewLoading(true);
        const preview = await previewRelocationApi(editing.id, fOrgUnit);
        setRelocationPreview(preview);
        setPreviewLoading(false);
        if (preview.requiresAction || preview.warnings.length > 0 || preview.unmappedEquipment.length > 0) {
          return;
        }
      }
      await persistEmployee();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri spremanju';
      toastError(message);
      setPreviewLoading(false);
    }
  };

  const confirmRelocationSave = async () => {
    try {
      await persistEmployee();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri spremanju';
      toastError(message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!admin) return;
    if (!confirm('Da li ste sigurni?')) return;
    try {
      await deleteEmployeeApi(id);
      await refresh();
    await list.refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri brisanju';
      toastError(message);
    }
  };

  return (
    <div>
      <PageHeaderRow
        title="Radnici"
        description={admin ? 'Evidencija radnika po organizacijskim jedinicama' : 'Pregled radnika u vašem opsegu'}
        actions={admin ? (
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus size={16} /> Novi radnik
          </button>
        ) : undefined}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pretraži radnike..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={filterOrgUnit}
          onChange={e => setFilterOrgUnit(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-full sm:w-auto sm:min-w-[200px]"
        >
          <option value="">Sve org. jedinice</option>
          {scopedOrgUnits.map(o => (
            <option key={o.id} value={o.id}>{o.name} ({getOrgUnitTypeLabel(o.type)})</option>
          ))}
        </select>
      </div>

      <ResponsiveTable
        isEmpty={filtered.length === 0}
        emptyMessage="Nema rezultata"
        mobile={filtered.map((emp) => {
          const orgUnit = state.orgUnits.find(o => o.id === emp.orgUnitId);
          const eqCount = emp.heldEquipmentCount ?? 0;
          return (
            <div key={emp.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-800">{emp.firstName} {emp.lastName}</p>
                  <p className="text-sm text-gray-600">{emp.title}</p>
                </div>
                {eqCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">
                    <Package size={12} /> {eqCount}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-gray-500">{orgUnit ? getOrgUnitPath(state.orgUnits, orgUnit.id) : '—'}</p>
              {emp.email ? <p className="text-xs text-gray-500">{emp.email}</p> : null}
              {admin ? (
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => openEdit(emp)} className="text-blue-500 hover:text-blue-700 p-1" title="Uredi">
                    <Edit2 size={14} />
                  </button>
                  <button type="button" onClick={() => handleDelete(emp.id)} className="text-red-500 hover:text-red-700 p-1" title="Obriši">
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        desktop={
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Ime i prezime</th>
                <th className="px-4 py-3 font-medium text-gray-600">Pozicija</th>
                <th className="px-4 py-3 font-medium text-gray-600">Org. jedinica</th>
                <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-center">Oprema</th>
                {admin ? (
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Akcije</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => {
                const orgUnit = state.orgUnits.find(o => o.id === emp.orgUnitId);
                const eqCount = emp.heldEquipmentCount ?? 0;
                return (
                  <tr key={emp.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{emp.firstName} {emp.lastName}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{emp.title}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{orgUnit ? getOrgUnitPath(state.orgUnits, orgUnit.id) : '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{emp.email || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {eqCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          <Package size={12} /> {eqCount}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">0</span>
                      )}
                    </td>
                    {admin ? (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => openEdit(emp)} className="text-blue-500 hover:text-blue-700 p-1" title="Uredi">
                            <Edit2 size={14} />
                          </button>
                          <button type="button" onClick={() => handleDelete(emp.id)} className="text-red-500 hover:text-red-700 p-1" title="Obriši">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
      />

      {list.meta ? (
        <PaginationControls
          page={list.page}
          pageSize={list.pageSize}
          total={list.meta.total}
          totalPages={list.meta.totalPages}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          className="rounded-b-xl border border-t-0 border-gray-100"
        />
      ) : null}

      <ModalRoot
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setRelocationPreview(null);
        }}
        size="lg"
        panelClassName="bg-white shadow-xl"
      >
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">{editing ? 'Uredi radnika' : 'Novi radnik'}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ime *</label>
                  <input type="text" value={fFirstName} onChange={e => setFFirstName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prezime *</label>
                  <input type="text" value={fLastName} onChange={e => setFLastName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pozicija / Titula</label>
                <EmployeeTitleAutocomplete
                  value={fTitle}
                  onChange={setFTitle}
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Pri fokusu: nedavne pozicije. Pri kucanju: pretraga postojećih naziva radi dosljednosti.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Org. jedinica *</label>
                <OrgUnitAutocomplete
                  value={fOrgUnit}
                  onChange={setFOrgUnit}
                  required
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Pri fokusu: lista org. jedinica. Pri kucanju: pretraga po nazivu, tipu ili putanji.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                  <input type="text" value={fPhone} onChange={e => setFPhone(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
              </div>
              {relocationPreview ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
                  <p className="font-medium">Promjena org. jedinice — pregled opreme</p>
                  <p>
                    Zaduženo komada: <strong>{relocationPreview.assignedCount}</strong>
                    {relocationPreview.sameWarehouse
                      ? ' (isto skladište — nema dodatnih akcija)'
                      : ' (drugo skladište — evidentičari će dobiti zadatke)'}
                  </p>
                  {relocationPreview.byCategory.length > 0 ? (
                    <ul className="text-xs space-y-0.5">
                      {relocationPreview.byCategory.map((row) => (
                        <li key={row.categoryId}>
                          {row.categoryName}: {row.count}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {relocationPreview.warnings.map((warning) => (
                    <p key={warning} className="text-xs text-red-700">
                      {warning}
                    </p>
                  ))}
                  {relocationPreview.unmappedEquipment.length > 0 ? (
                    <div className="text-xs text-red-800 space-y-1">
                      <p className="font-medium">Oprema bez šifrarnika (transfer blokiran):</p>
                      <ul className="list-disc pl-4">
                        {relocationPreview.unmappedEquipment.map((row) => (
                          <li key={row.equipmentId}>
                            {row.inventoryNumber} — {row.categoryName}
                          </li>
                        ))}
                      </ul>
                      <p>Administrator mora mapirati tip na stranici Org. promjena prije transfera.</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowForm(false);
                  setRelocationPreview(null);
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Odustani
              </button>
              {relocationPreview ? (
                <button
                  onClick={() => void confirmRelocationSave()}
                  className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
                >
                  Potvrdi promjenu
                </button>
              ) : (
                <button
                  onClick={() => void handleSave()}
                  disabled={previewLoading}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  {previewLoading ? 'Provjera…' : editing ? 'Sačuvaj' : 'Dodaj'}
                </button>
              )}
            </div>
      </ModalRoot>
    </div>
  );
}
