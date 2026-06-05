import { useState, useMemo } from 'react';
import { useStore, useRefreshData } from '../useStore';
import { updateEquipmentApi } from '../api/data-api';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/toast-context';
import { usePublicSettings } from '../contexts/public-settings-context';
import { Search, Eye, Edit2, Filter, QrCode, Printer, List, Warehouse as WarehouseIcon, Info } from 'lucide-react';
import { isAdmin, isEvidenticar, isSkladistar, getCurrentUser, equipmentMatchesScope } from '../store';
import { LabelPrintSheet } from './LabelPrintSheet';
import { getStatusLabel, getStatusColor, formatDate, getEmployeeFullName } from '../helpers';
import type { Equipment } from '../types';
import { EquipmentCard } from './EquipmentCard';
import { WarehouseDetailView } from './warehouses/warehouse-detail-view';
import { getUserWarehouseIds } from '../helpers/org-warehouse.util';
import {
  InventoryFreezeActionHint,
  useInventoryFreezeActive,
} from './inventory-count/inventory-freeze-action-hint';
import type { PageId } from './page-id';
import { PageTabs } from './ui/page-tabs';
import { PageHeaderRow } from './ui/page-header-row';
import { ResponsiveTable } from './ui/responsive-table';

interface EquipmentPageProps {
  onNavigate?: (page: PageId) => void;
}

export function EquipmentPage({ onNavigate }: EquipmentPageProps) {
  const { getBoolean } = usePublicSettings();
  const labelsEnabled = getBoolean('features.equipment_labels', true);
  const [state] = useStore();
  const refresh = useRefreshData();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [viewItemId, setViewItemId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showLabels, setShowLabels] = useState(false);
  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const skladistar = isSkladistar();
  const user = getCurrentUser();
  const { toastError } = useToast();
  const canManage = admin || evidenticar;
  const isFrozen = useInventoryFreezeActive();
  const [viewMode, setViewMode] = useState<'list' | 'warehouses'>('list');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const myWarehouseIds = useMemo(
    () => getUserWarehouseIds(user?.role, user?.id, user?.registrarScopes ?? [], state.warehouses),
    [state.warehouses, user?.id, user?.registrarScopes, user?.role],
  );
  const myWarehouses = useMemo(() => {
    if (admin) {
      return state.warehouses;
    }
    return state.warehouses.filter((row) => myWarehouseIds.has(row.id));
  }, [admin, myWarehouseIds, state.warehouses]);

  // Form state
  const [fCategoryId, setFCategoryId] = useState('');
  const [fInventoryNumber, setFInventoryNumber] = useState('');
  const [fSpecs, setFSpecs] = useState<Record<string, string>>({});
  const [fContract, setFContract] = useState('');
  const [fEntryDate, setFEntryDate] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fWarehouseId, setFWarehouseId] = useState('');

  const formWarehouses = useMemo(() => {
    if (skladistar && !admin) {
      return state.warehouses.filter((row) => myWarehouseIds.has(row.id));
    }
    return state.warehouses.filter((row) => row.isActive !== false);
  }, [admin, myWarehouseIds, skladistar, state.warehouses]);

  const filtered = useMemo(() => {
    return state.equipment.filter(eq => {
      if (evidenticar && !admin && !equipmentMatchesScope(eq, state, user)) {
        return false;
      }
      const cat = state.categories.find(c => c.id === eq.categoryId);
      const holder = eq.currentHolderId ? state.employees.find(e => e.id === eq.currentHolderId) : null;
      const searchStr = `${eq.inventoryNumber} ${cat?.name || ''} ${holder ? `${holder.firstName} ${holder.lastName}` : ''} ${Object.values(eq.specifications).join(' ')}`.toLowerCase();
      const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
      const matchCat = filterCategory === '' || eq.categoryId === filterCategory;
      const matchStatus = filterStatus === '' || eq.status === filterStatus;
      return matchSearch && matchCat && matchStatus;
    });
  }, [state, admin, evidenticar, user, search, filterCategory, filterStatus]);

  const selectedCategory = state.categories.find(c => c.id === fCategoryId);

  function openEdit(eq: Equipment) {
    setEditing(eq);
    setFCategoryId(eq.categoryId);
    setFInventoryNumber(eq.inventoryNumber);
    setFSpecs({ ...eq.specifications });
    setFContract(eq.contractNumber || '');
    setFEntryDate(eq.entryDate);
    setFNotes(eq.notes || '');
    setFWarehouseId(eq.warehouseId ?? '');
    setShowForm(true);
  }

  const handleSave = async () => {
    if (!editing || !fCategoryId || !fInventoryNumber.trim()) {
      return;
    }
    const status = editing.status;
    if (status === 'skladiste' && !fWarehouseId) {
      toastError('Odaberite skladište za opremu na skladištu.');
      return;
    }
    const payload = {
      categoryId: fCategoryId,
      inventoryNumber: fInventoryNumber.trim(),
      specifications: fSpecs,
      status,
      contractNumber: fContract || undefined,
      entryDate: fEntryDate,
      notes: fNotes || undefined,
      warehouseId: status === 'skladiste' ? fWarehouseId : undefined,
    };
    try {
      await updateEquipmentApi(editing.id, payload);
      await refresh();
      setShowForm(false);
      setEditing(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri spremanju';
      toastError(message);
    }
  };

  if (selectedWarehouseId) {
    return (
      <WarehouseDetailView
        warehouseId={selectedWarehouseId}
        onBack={() => setSelectedWarehouseId(null)}
        canEditContext={admin}
        canManageDestruction={admin || skladistar}
        canReceiveStock={admin || skladistar}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div>
      <PageHeaderRow
        title="Oprema"
        description={
          labelsEnabled
            ? 'Evidencija opreme. Naljepnice: označite redove u tabeli (checkbox), zatim „Štampaj naljepnice“.'
            : 'Evidencija opreme.'
        }
        actions={
          labelsEnabled && selectedIds.size > 0 ? (
            <button
              type="button"
              onClick={() => setShowLabels(true)}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              <Printer size={16} /> Štampaj naljepnice ({selectedIds.size})
            </button>
          ) : undefined
        }
      />

      {canManage && (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info size={18} className="shrink-0 mt-0.5 text-blue-600" aria-hidden />
          <p className="flex-1 min-w-[200px]">
            Nova oprema se ne dodaje ovdje. Prvo evidentirajte prijem robe na skladištu, zatim evidentičar
            izdaje komade iz skladišnog lota (zaduženje).
          </p>
          {(evidenticar || admin) && (
            <button
              type="button"
              onClick={() => setViewMode('warehouses')}
              className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Po skladištima
            </button>
          )}
          {onNavigate && (admin || skladistar) && (
            <button
              type="button"
              onClick={() => onNavigate('warehouses')}
              className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Modul Skladišta
            </button>
          )}
        </div>
      )}

      <InventoryFreezeActionHint onOpenInventory={onNavigate} />

      {(evidenticar || admin) && (
        <PageTabs
          tabs={[
            { id: 'list', label: 'Sva oprema', icon: List },
            { id: 'warehouses', label: 'Po skladištima', icon: WarehouseIcon },
          ]}
          activeTab={viewMode}
          onChange={setViewMode}
          className="mb-4"
        />
      )}

      {viewMode === 'warehouses' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {myWarehouses.map((warehouse) => {
            const count = state.equipment.filter(
              (row) => row.warehouseId === warehouse.id && row.status === 'skladiste',
            ).length;
            return (
              <button
                key={warehouse.id}
                type="button"
                onClick={() => setSelectedWarehouseId(warehouse.id)}
                className="text-left bg-white border border-gray-100 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition"
              >
                <p className="font-medium text-gray-900">{warehouse.name}</p>
                <p className="text-xs text-gray-500 mt-1">{count} na skladištu</p>
              </button>
            );
          })}
          {myWarehouses.length === 0 ? (
            <p className="text-sm text-gray-500 col-span-full">Nema skladišta u vašem opsegu.</p>
          ) : null}
        </div>
      ) : null}

      {viewMode === 'list' ? (
        <>
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Pretraži po inv. broju, serijskom broju, osobi..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
            <option value="">Sve kategorije</option>
            {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
            <option value="">Svi statusi</option>
            <option value="skladiste">Na skladištu</option>
            <option value="zaduzeno">Zaduženo</option>
            <option value="rashodovano">Rashodovano</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-4 text-xs">
        <span className="bg-white border border-gray-200 px-3 py-1.5 rounded-lg">Prikazano: <strong>{filtered.length}</strong> od {state.equipment.length}</span>
        <span className="bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg text-blue-700">Skladište: <strong>{filtered.filter(e => e.status === 'skladiste').length}</strong></span>
        <span className="bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg text-green-700">Zaduženo: <strong>{filtered.filter(e => e.status === 'zaduzeno').length}</strong></span>
        <span className="bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg text-red-700">Rashod: <strong>{filtered.filter(e => e.status === 'rashodovano').length}</strong></span>
      </div>

      <ResponsiveTable
        isEmpty={filtered.length === 0}
        emptyMessage="Nema rezultata"
        mobile={filtered.map((eq) => {
          const cat = state.categories.find(c => c.id === eq.categoryId);
          const holder = eq.currentHolderId ? state.employees.find(e => e.id === eq.currentHolderId) : null;
          return (
            <div key={eq.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs font-medium text-gray-800">{eq.inventoryNumber}</p>
                  <p className="text-sm text-gray-600">{cat?.name || '—'}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${getStatusColor(eq.status)}`}>
                  {getStatusLabel(eq.status)}
                </span>
              </div>
              {holder ? <p className="text-xs text-gray-500">{getEmployeeFullName(holder)}</p> : null}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setViewItemId(eq.id)} className="text-gray-500 hover:text-blue-600 p-1" title="Detalji">
                  <Eye size={14} />
                </button>
                {eq.status !== 'rashodovano' && canManage && (
                  <button type="button" onClick={() => openEdit(eq)} className="text-blue-500 hover:text-blue-700 p-1" title="Uredi">
                    <Edit2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        desktop={
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                {labelsEnabled ? (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((eq) => selectedIds.has(eq.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(filtered.map((eq) => eq.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      aria-label="Odaberi sve"
                    />
                  </th>
                ) : null}
                <th className="px-4 py-3 font-medium text-gray-600">Inv. broj</th>
                <th className="px-4 py-3 font-medium text-gray-600">Kategorija</th>
                <th className="px-4 py-3 font-medium text-gray-600">Ključne spec.</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600">Zadužen na</th>
                <th className="px-4 py-3 font-medium text-gray-600">Ugovor</th>
                <th className="px-4 py-3 font-medium text-gray-600">Datum ulaza</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(eq => {
                const cat = state.categories.find(c => c.id === eq.categoryId);
                const holder = eq.currentHolderId ? state.employees.find(e => e.id === eq.currentHolderId) : null;
                const holderOrg = holder ? state.orgUnits.find(o => o.id === holder.orgUnitId) : null;
                const specPreviews = cat ? cat.fields.slice(0, 2).map(f => `${f.name}: ${eq.specifications[f.id] || '—'}`).join(' | ') : '';

                return (
                  <tr key={eq.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    {labelsEnabled ? (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(eq.id)}
                          onChange={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(eq.id)) {
                                next.delete(eq.id);
                              } else {
                                next.add(eq.id);
                              }
                              return next;
                            });
                          }}
                          aria-label={`Odaberi ${eq.inventoryNumber}`}
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-gray-800">{eq.inventoryNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-700">{cat?.name || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{specPreviews}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(eq.status)}`}>
                        {getStatusLabel(eq.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {holder ? (
                        <div>
                          <span className="text-gray-700 text-xs">{getEmployeeFullName(holder)}</span>
                          {holderOrg && (
                            <p className="text-[10px] text-gray-400">{holderOrg.name}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{eq.contractNumber || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(eq.entryDate)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => setViewItemId(eq.id)} className="text-gray-500 hover:text-blue-600 p-1" title="Pogledaj detalje / QR">
                          <QrCode size={14} />
                        </button>
                        <button type="button" onClick={() => setViewItemId(eq.id)} className="text-gray-500 hover:text-gray-700 p-1" title="Pogledaj detalje">
                          <Eye size={14} />
                        </button>
                        {eq.status !== 'rashodovano' && canManage && (
                          <button type="button" onClick={() => openEdit(eq)} className="text-blue-500 hover:text-blue-700 p-1" title="Uredi">
                            <Edit2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
      />
        </>
      ) : null}

      {labelsEnabled && showLabels && (
        <LabelPrintSheet
          items={state.equipment.filter((eq) => selectedIds.has(eq.id))}
          categories={state.categories}
          onClose={() => setShowLabels(false)}
        />
      )}

      {/* Equipment Card Modal with QR */}
      {viewItemId && (
        <EquipmentCard
          equipmentId={viewItemId}
          onClose={() => setViewItemId(null)}
          showTransferActions={true}
        />
      )}

      {/* Edit Form Modal */}
      {showForm && editing && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={() => { setShowForm(false); setEditing(null); }}>
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">Uredi opremu</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kategorija *</label>
                  <select value={fCategoryId} onChange={e => { setFCategoryId(e.target.value); setFSpecs({}); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                    <option value="">— Odaberi —</option>
                    {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Inventurni broj *</label>
                  <input type="text" value={fInventoryNumber} onChange={e => setFInventoryNumber(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Npr. INV-RS-2024-0021" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Broj ugovora</label>
                  <input type="text" value={fContract} onChange={e => setFContract(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Npr. UG-2024-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Datum ulaza na skladište</label>
                  <input type="date" value={fEntryDate} onChange={e => setFEntryDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
              </div>
              {editing.status === 'skladiste' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Skladište *</label>
                  <select
                    value={fWarehouseId}
                    onChange={(e) => setFWarehouseId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">— Odaberi skladište —</option>
                    {formWarehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {selectedCategory && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Specifikacije</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedCategory.fields.map(f => (
                        <div key={f.id}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {f.name} {f.required && <span className="text-red-500">*</span>}
                            {f.unique && <span className="text-purple-500 ml-1">(unikat)</span>}
                          </label>
                          {f.type === 'select' ? (
                            <select value={fSpecs[f.id] || ''} onChange={e => setFSpecs({ ...fSpecs, [f.id]: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                              <option value="">— Odaberi —</option>
                              {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input
                              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                              value={fSpecs[f.id] || ''}
                              onChange={e => setFSpecs({ ...fSpecs, [f.id]: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  {selectedCategory.optionalFields.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-500 mb-2">Opcionalna polja</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {selectedCategory.optionalFields.map(f => (
                          <div key={f.id}>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              {f.name}
                              {f.unique && <span className="text-purple-500 ml-1">(unikat)</span>}
                            </label>
                            {f.type === 'select' ? (
                              <select value={fSpecs[f.id] || ''} onChange={e => setFSpecs({ ...fSpecs, [f.id]: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                                <option value="">— Odaberi —</option>
                                {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input
                                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                                value={fSpecs[f.id] || ''}
                                onChange={e => setFSpecs({ ...fSpecs, [f.id]: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Napomene</label>
                <textarea value={fNotes} onChange={e => setFNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" rows={2} />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50">Odustani</button>
              <button onClick={handleSave} disabled={isFrozen} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
                Sačuvaj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
