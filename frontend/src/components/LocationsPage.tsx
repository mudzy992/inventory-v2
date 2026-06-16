import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Edit2, Plus, Trash2, MapPin, Building2, List } from 'lucide-react';
import {
  createCantonApi,
  createCityApi,
  deleteCantonApi,
  deleteCityApi,
  updateCantonApi,
  updateCityApi,
} from '../api/locations-api';
import { ApiError } from '../api/client';
import { canDeleteCanton, canDeleteCity } from '../helpers/guards';
import { getApiErrorMessage, refreshAfterMutation } from '../helpers/run-mutation-with-refresh.util';
import { useToast } from '../contexts/toast-context';
import { useStore, useRefreshData } from '../useStore';
import { PageHeaderRow } from './ui/page-header-row';
import { FormCard } from './ui/form-card';
import { Button } from './ui/button';
import { PageTabs } from './ui/page-tabs';
import { ModalRoot } from './ui/modal-root';
import { inputClass, selectClass } from './ui/form-styles';
import type { Canton, City } from '../types';
import {
  buildLocationRegistry,
  formatCantonDisplayName,
} from '../utils/location-registry.util';

type LocationsTab = 'cantons' | 'cities' | 'registry';

type EditTarget =
  | { type: 'canton'; item: Canton }
  | { type: 'city'; item: City }
  | null;

type DeleteTarget =
  | { type: 'canton'; item: Canton }
  | { type: 'city'; item: City }
  | null;

export const LocationsPage = () => {
  const [state] = useStore();
  const refresh = useRefreshData();
  const { toastError, toastSuccess } = useToast();
  const [tab, setTab] = useState<LocationsTab>('registry');
  const [cantonName, setCantonName] = useState('');
  const [cityName, setCityName] = useState('');
  const [cityCantonId, setCityCantonId] = useState('');
  const [expandedCantons, setExpandedCantons] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editCantonId, setEditCantonId] = useState('');

  const locationRegistry = useMemo(
    () => buildLocationRegistry(state.cantons, state.cities),
    [state.cantons, state.cities],
  );
  const { rows: cantonsWithCities, stats: registryStats } = locationRegistry;

  const handleAddCanton = async () => {
    if (!cantonName.trim()) return;
    try {
      await createCantonApi({ name: cantonName.trim() });
      setCantonName('');
      await refresh();
      toastSuccess('Kanton je dodan.');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };

  const handleAddCity = async () => {
    if (!cityName.trim() || !cityCantonId) return;
    try {
      await createCityApi({ cantonId: cityCantonId, name: cityName.trim() });
      setCityName('');
      await refresh();
      toastSuccess('Grad je dodan.');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };

  const handleToggleCanton = (cantonId: string) => {
    setExpandedCantons((prev) => {
      const next = new Set(prev);
      if (next.has(cantonId)) {
        next.delete(cantonId);
      } else {
        next.add(cantonId);
      }
      return next;
    });
  };

  const handleOpenEdit = (target: EditTarget) => {
    if (!target) return;
    setEditTarget(target);
    if (target.type === 'canton') {
      setEditName(target.item.name);
      setEditCode(target.item.code ?? '');
      setEditCantonId('');
    } else {
      setEditName(target.item.name);
      setEditCode('');
      setEditCantonId(target.item.cantonId);
    }
  };

  const handleCloseEdit = () => {
    setEditTarget(null);
    setEditName('');
    setEditCode('');
    setEditCantonId('');
  };

  const handleSaveEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    try {
      if (editTarget.type === 'canton') {
        await updateCantonApi(editTarget.item.id, {
          name: editName.trim(),
          code: editCode.trim() || undefined,
        });
      } else {
        await updateCityApi(editTarget.item.id, {
          name: editName.trim(),
          cantonId: editCantonId || editTarget.item.cantonId,
        });
      }
      await refresh();
      handleCloseEdit();
      toastSuccess('Izmjena je sačuvana.');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'canton') {
      const guard = canDeleteCanton(deleteTarget.item.id, state.cities);
      if (!guard.allowed) {
        toastError(guard.reason ?? 'Brisanje nije dozvoljeno.');
        return;
      }
    } else {
      const guard = canDeleteCity(
        deleteTarget.item.id,
        state.orgUnits,
        state.warehouses,
        state.cities.find((row) => row.id === deleteTarget.item.id)?.disposalCommissionCount ?? 0,
      );
      if (!guard.allowed) {
        toastError(guard.reason ?? 'Brisanje nije dozvoljeno.');
        return;
      }
    }
    try {
      if (deleteTarget.type === 'canton') {
        await deleteCantonApi(deleteTarget.item.id);
      } else {
        await deleteCityApi(deleteTarget.item.id);
      }
      toastSuccess('Stavka je obrisana.');
      setDeleteTarget(null);
      await refreshAfterMutation([refresh]);
    } catch (err) {
      toastError(getApiErrorMessage(err, 'Greška pri brisanju'));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeaderRow title="Lokacije" description="Kantoni i gradovi — vezuju se na org. jedinice" />
      <PageTabs
        tabs={[
          { id: 'registry', label: 'Registar', icon: List },
          { id: 'cantons', label: 'Kantoni', icon: MapPin },
          { id: 'cities', label: 'Gradovi', icon: Building2 },
        ]}
        activeTab={tab}
        onChange={setTab}
      />
      {tab === 'cantons' ? (
        <div className="space-y-4">
          <FormCard title="Novi kanton">
            <input
              value={cantonName}
              onChange={(e) => setCantonName(e.target.value)}
              placeholder="Npr. Kanton Sarajevo"
              className={inputClass}
            />
            <Button onClick={() => void handleAddCanton()}>
              <Plus size={14} /> Dodaj kanton
            </Button>
          </FormCard>
          {state.cantons.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-medium text-gray-900 text-sm">Svi kantoni</h2>
                <span className="text-xs text-gray-500">{registryStats.cantonCount} ukupno</span>
              </div>
              <ul className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                {cantonsWithCities.map((canton, index) => (
                  <li key={`${canton.id}-${index}`} className="px-4 py-2.5 text-sm text-gray-700 flex gap-3">
                    <span className="text-xs text-gray-400 tabular-nums w-5 shrink-0">{index + 1}.</span>
                    <span className="min-w-0 truncate">{formatCantonDisplayName(canton.name)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {tab === 'cities' ? (
        <FormCard title="Novi grad">
          <select value={cityCantonId} onChange={(e) => setCityCantonId(e.target.value)} className={selectClass}>
            <option value="">Kanton</option>
            {state.cantons.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            placeholder="Npr. Sarajevo"
            className={inputClass}
          />
          <Button onClick={() => void handleAddCity()}>
            <Plus size={14} /> Dodaj grad
          </Button>
        </FormCard>
      ) : null}
      {tab === 'registry' ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
            <h2 className="font-medium text-gray-900">Hijerarhija lokacija</h2>
            <span className="text-xs text-gray-500 shrink-0">
              {registryStats.cantonCount} kantona · {registryStats.cityCount} gradova
            </span>
          </div>
          {registryStats.hasDuplicateCantonIds ||
          registryStats.rawCantonCount !== registryStats.cantonCount ? (
            <p className="px-4 py-2 text-xs text-amber-800 bg-amber-50 border-b border-amber-100">
              Učitano je {registryStats.rawCantonCount} zapisa kantona, ali se prikazuje{' '}
              {registryStats.cantonCount} zbog duplikata ID. Osvježite stranicu; ako se ponovi,
              provjerite podatke u bazi.
            </p>
          ) : null}
          {cantonsWithCities.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Nema kantona. Dodajte kanton u tabu Kantoni.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {cantonsWithCities.map((canton, index) => {
                const isExpanded = expandedCantons.has(canton.id);
                return (
                  <div key={`${canton.id}-${index}`}>
                    <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50">
                      <button
                        type="button"
                        onClick={() => handleToggleCanton(canton.id)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        aria-label={isExpanded ? 'Sakrij gradove' : 'Prikaži gradove'}
                      >
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <span className="text-xs text-gray-400 tabular-nums w-5 shrink-0 text-right">
                        {index + 1}
                      </span>
                      <MapPin size={16} className="text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800">
                          {formatCantonDisplayName(canton.name)}
                        </p>
                        <p className="text-xs text-gray-400">
                          {canton.cities.length} gradova
                          {canton.code ? ` · ${canton.code}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit({ type: 'canton', item: canton })}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"
                          aria-label="Uredi kanton"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ type: 'canton', item: canton })}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"
                          aria-label="Obriši kanton"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ul className="bg-gray-50/80 border-t border-gray-100">
                        {canton.cities.length === 0 ? (
                          <li className="px-12 py-3 text-xs text-gray-400">Nema gradova u ovom kantonu.</li>
                        ) : (
                          canton.cities.map((city) => (
                            <li
                              key={city.id}
                              className="flex items-center gap-2 px-4 py-2.5 pl-12 hover:bg-gray-100/80 border-t border-gray-100 first:border-t-0"
                            >
                              <Building2 size={14} className="text-gray-400 shrink-0" />
                              <span className="flex-1 text-sm text-gray-700">{city.name}</span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit({ type: 'city', item: city })}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"
                                  aria-label="Uredi grad"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget({ type: 'city', item: city })}
                                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"
                                  aria-label="Obriši grad"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          {cantonsWithCities.length > 0 ? (
            <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100 bg-gray-50/80">
              Prikazano {registryStats.cantonCount} kantona u hijerarhiji.
            </p>
          ) : null}
        </div>
      ) : null}

      <ModalRoot open={Boolean(editTarget)} onClose={handleCloseEdit} size="md" enableEscape closeOnBackdrop>
        <div className="bg-white rounded-xl shadow-xl w-full p-6">
          <h3 className="text-lg font-semibold mb-4">
            {editTarget?.type === 'canton' ? 'Uredi kanton' : 'Uredi grad'}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Naziv</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={inputClass}
              />
            </div>
            {editTarget?.type === 'canton' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Šifra (opcionalno)</label>
                <input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className={inputClass}
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kanton</label>
                <select
                  value={editCantonId}
                  onChange={(e) => setEditCantonId(e.target.value)}
                  className={selectClass}
                >
                  {state.cantons.map((canton) => (
                    <option key={canton.id} value={canton.id}>{canton.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="secondary" onClick={handleCloseEdit}>Odustani</Button>
            <Button type="button" onClick={() => void handleSaveEdit()}>Sačuvaj</Button>
          </div>
        </div>
      </ModalRoot>

      <ModalRoot open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} size="sm" enableEscape closeOnBackdrop>
        <div className="bg-white rounded-xl shadow-xl w-full p-6">
          <h3 className="text-lg font-semibold mb-2">Potvrda brisanja</h3>
          <p className="text-sm text-gray-600 mb-4">
            {deleteTarget?.type === 'canton'
              ? `Obrisati kanton „${deleteTarget.item.name}"? Moguće je samo ako nema gradova.`
              : `Obrisati grad „${deleteTarget?.item.name}"? Moguće je samo ako nije vezan na org jedinice, skladišta ili komisije.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>Odustani</Button>
            <Button type="button" variant="danger" onClick={() => void handleConfirmDelete()}>
              Obriši
            </Button>
          </div>
        </div>
      </ModalRoot>
    </div>
  );
};
