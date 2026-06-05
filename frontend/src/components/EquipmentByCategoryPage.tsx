import { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '../useStore';
import { fetchEquipmentApi, fetchEquipmentPageApi, fetchEquipmentSummaryApi } from '../api/equipment-api';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { PaginationControls } from './ui/pagination-controls';
import {
  getParentCategories,
  getSubCategories,
  isAdmin,
  isEvidenticar,
  getCurrentUser,
} from '../store';
import { ChevronRight, Folder, Layers, Search, Filter, Download, X, Eye, QrCode, Printer } from 'lucide-react';
import { LabelPrintSheet } from './LabelPrintSheet';
import { getStatusLabel, getStatusColor, getEmployeeFullName } from '../helpers';
import { EquipmentCard } from './EquipmentCard';
import { AlertBanner } from './ui/alert-banner';
import type { Equipment, FilterCondition } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { ModalRoot } from './ui/modal-root';

export function EquipmentByCategoryPage() {
  const [state, setState] = useStore();
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [viewItemId, setViewItemId] = useState<string | null>(null);
  const [viewShowQR, setViewShowQR] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showLabels, setShowLabels] = useState(false);
  const [labelItems, setLabelItems] = useState<Equipment[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);
  
  // Dynamic filters
  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([]);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [newFilterField, setNewFilterField] = useState('');
  const [newFilterOperator, setNewFilterOperator] = useState<FilterCondition['operator']>('contains');
  const [newFilterValue, setNewFilterValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Saved filter name
  const [filterName, setFilterName] = useState('');
  const [showSaveFilter, setShowSaveFilter] = useState(false);

  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const user = getCurrentUser();
  const [categoryStats, setCategoryStats] = useState<
    Record<string, { total: number; skladiste: number; zaduzeno: number; rashodovano: number }>
  >({});

  useEffect(() => {
    if (!selectedParentId) {
      return;
    }
    const subs = getSubCategories(selectedParentId);
    void Promise.all(
      subs.map(async (sub) => {
        const summary = await fetchEquipmentSummaryApi(sub.id);
        return [
          sub.id,
          {
            total: summary.total,
            skladiste: summary.byStatus.skladiste,
            zaduzeno: summary.byStatus.zaduzeno,
            rashodovano: summary.byStatus.rashodovano,
          },
        ] as const;
      }),
    ).then((entries) => setCategoryStats(Object.fromEntries(entries)));
  }, [selectedParentId]);

  const parentCategories = getParentCategories();
  const selectedParent = parentCategories.find(p => p.id === selectedParentId);
  const subCategories = selectedParentId ? getSubCategories(selectedParentId) : [];
  const selectedSub = subCategories.find(s => s.id === selectedSubId);

  const fetchPage = useCallback(
    (params: { page?: number; pageSize?: number; search?: string }) =>
      fetchEquipmentPageApi({ ...params, categoryId: selectedSubId! }),
    [selectedSubId],
  );

  const equipmentList = usePaginatedList({
    fetchPage,
    enabled: Boolean(selectedSubId),
  });

  const categoryEquipment = equipmentList.items;

  useEffect(() => {
    equipmentList.setSearch(searchQuery);
  }, [searchQuery]);

  const filteredEquipment = useMemo(() => {
    let items = categoryEquipment;
    for (const filter of activeFilters) {
      items = items.filter((e) => {
        let value: string;
        if (filter.fieldId === 'status') {
          value = e.status;
        } else if (filter.fieldId === 'inventoryNumber') {
          value = e.inventoryNumber;
        } else if (filter.fieldId === 'contractNumber') {
          value = e.contractNumber || '';
        } else if (filter.fieldId === 'currentHolder') {
          const holder = e.currentHolder;
          value = holder ? `${holder.firstName} ${holder.lastName}` : '';
        } else {
          value = e.specifications[filter.fieldId] || '';
        }
        const filterVal = filter.value.toLowerCase();
        const itemVal = value.toLowerCase();
        switch (filter.operator) {
          case 'equals':
            return itemVal === filterVal;
          case 'contains':
            return itemVal.includes(filterVal);
          case 'startsWith':
            return itemVal.startsWith(filterVal);
          case 'gt':
            return parseFloat(value) > parseFloat(filter.value);
          case 'lt':
            return parseFloat(value) < parseFloat(filter.value);
          case 'gte':
            return parseFloat(value) >= parseFloat(filter.value);
          case 'lte':
            return parseFloat(value) <= parseFloat(filter.value);
          default:
            return true;
        }
      });
    }
    return items;
  }, [categoryEquipment, activeFilters]);

  // Get available fields for filtering
  const availableFilterFields = useMemo(() => {
    const fields: { id: string; name: string; type: string }[] = [
      { id: 'inventoryNumber', name: 'Inventurni broj', type: 'text' },
      { id: 'status', name: 'Status', type: 'select' },
      { id: 'contractNumber', name: 'Broj ugovora', type: 'text' },
      { id: 'currentHolder', name: 'Zadužen na', type: 'text' },
    ];
    
    if (selectedSub) {
      [...selectedSub.fields, ...selectedSub.optionalFields].forEach(f => {
        fields.push({ id: f.id, name: f.name, type: f.type });
      });
    }
    
    return fields;
  }, [selectedSub]);

  function addFilter() {
    if (!newFilterField || !newFilterValue) return;
    
    const field = availableFilterFields.find(f => f.id === newFilterField);
    if (!field) return;
    
    setActiveFilters([...activeFilters, {
      fieldId: newFilterField,
      fieldName: field.name,
      operator: newFilterOperator,
      value: newFilterValue,
    }]);
    
    setNewFilterField('');
    setNewFilterValue('');
    setShowFilterBuilder(false);
  }

  function removeFilter(index: number) {
    setActiveFilters(activeFilters.filter((_, i) => i !== index));
  }

  function clearAllFilters() {
    setActiveFilters([]);
    setSearchQuery('');
  }

  function saveFilter() {
    if (!filterName.trim()) return;
    if (!user) return;
    
    const savedFilter = {
      id: uuidv4(),
      userId: user.id,
      name: filterName.trim(),
      categoryId: selectedSubId || undefined,
      filters: activeFilters,
    };
    
    setState(prev => ({
      ...prev,
      savedFilters: [...prev.savedFilters, savedFilter],
    }));
    
    setFilterName('');
    setShowSaveFilter(false);
  }

  async function openLabelPrint() {
    if (selectedIds.size === 0) {
      return;
    }
    setLoadingLabels(true);
    try {
      const fromPage = categoryEquipment.filter((eq) => selectedIds.has(eq.id));
      const loadedIds = new Set(fromPage.map((eq) => eq.id));
      const missing = [...selectedIds].filter((id) => !loadedIds.has(id));
      const fetched = await Promise.all(
        missing.map((id) => fetchEquipmentApi(id).catch(() => null)),
      );
      setLabelItems([
        ...fromPage,
        ...fetched.filter((eq): eq is Equipment => eq !== null),
      ]);
      setShowLabels(true);
    } finally {
      setLoadingLabels(false);
    }
  }

  function exportToCSV() {
    if (!selectedSub || filteredEquipment.length === 0) return;
    
    const headers = ['Inventurni broj', 'Status', 'Zadužen na', 'Ugovor', 'Datum ulaza'];
    selectedSub.fields.forEach(f => headers.push(f.name));
    selectedSub.optionalFields.forEach(f => headers.push(f.name));
    
    const rows = filteredEquipment.map(e => {
      const holder = e.currentHolder ?? null;
      const row = [
        e.inventoryNumber,
        getStatusLabel(e.status),
        holder ? `${holder.firstName} ${holder.lastName}` : '',
        e.contractNumber || '',
        e.entryDate,
      ];
      selectedSub.fields.forEach(f => row.push(e.specifications[f.id] || ''));
      selectedSub.optionalFields.forEach(f => row.push(e.specifications[f.id] || ''));
      return row;
    });
    
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `oprema-${selectedSub.name}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  // Stats for selected category
  const stats = selectedSubId ? categoryStats[selectedSubId] ?? null : null;

  useEffect(() => {
    setViewItemId(null);
    setViewShowQR(false);
  }, [selectedSubId]);

  const handleOpenEquipment = (equipmentId: string, showQR = false) => {
    setViewItemId(equipmentId);
    setViewShowQR(showQR);
  };

  const handleCloseEquipment = () => {
    setViewItemId(null);
    setViewShowQR(false);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Oprema po kategorijama</h1>
        <p className="text-gray-500 mt-1 text-sm sm:text-base">Pregled i filtriranje opreme organizovano po kategorijama</p>
      </div>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <button 
          onClick={() => { setSelectedParentId(null); setSelectedSubId(null); handleCloseEquipment(); }}
          className={`${!selectedParentId ? 'text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Sve kategorije
        </button>
        {selectedParent && (
          <>
            <ChevronRight size={14} className="text-gray-400" />
            <button 
              onClick={() => { setSelectedSubId(null); handleCloseEquipment(); }}
              className={`${!selectedSubId ? 'text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {selectedParent.name}
            </button>
          </>
        )}
        {selectedSub && (
          <>
            <ChevronRight size={14} className="text-gray-400" />
            <span className="text-blue-600 font-medium">{selectedSub.name}</span>
          </>
        )}
      </div>

      {/* Category Selection */}
      {!selectedSubId && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {!selectedParentId ? (
            // Show parent categories
            parentCategories.map(parent => {
              const subs = getSubCategories(parent.id);
              const parentStats = subCategories.reduce(
                (acc, sub) => {
                  const row = categoryStats[sub.id];
                  if (!row) {
                    return acc;
                  }
                  return {
                    total: acc.total + row.total,
                    zaduzeno: acc.zaduzeno + row.zaduzeno,
                    skladiste: acc.skladiste + row.skladiste,
                    rashodovano: acc.rashodovano + row.rashodovano,
                  };
                },
                { total: 0, zaduzeno: 0, skladiste: 0, rashodovano: 0 },
              );
              return (
                <button
                  key={parent.id}
                  onClick={() => setSelectedParentId(parent.id)}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-left hover:border-blue-200 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                      <Folder size={24} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800">{parent.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{parent.description}</p>
                      <div className="flex gap-2 mt-2">
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{subs.length} podkat.</span>
                        <span className="text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded">{parentStats.total} stavki</span>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </button>
              );
            })
          ) : (
            // Show sub-categories
            subCategories.map(sub => {
              const subStats = categoryStats[sub.id] ?? {
                total: 0,
                zaduzeno: 0,
                skladiste: 0,
                rashodovano: 0,
              };
              return (
                <button
                  key={sub.id}
                  onClick={() => setSelectedSubId(sub.id)}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 text-left hover:border-blue-200 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                      <Layers size={24} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800">{sub.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{sub.description}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{subStats.total} ukupno</span>
                        <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded">{subStats.zaduzeno} zaduž.</span>
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{subStats.skladiste} sklad.</span>
                        {subStats.rashodovano > 0 ? (
                          <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded">{subStats.rashodovano} rashod</span>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Equipment List for Selected Sub-Category */}
      {selectedSubId && selectedSub && (
        <>
          {/* Stats Bar */}
          {stats && (
            <div className="flex gap-3 mb-4 flex-wrap">
              <span className="bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-xs">Ukupno: <strong>{stats.total}</strong></span>
              <span className="bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg text-xs text-green-700">Zaduženo: <strong>{stats.zaduzeno}</strong></span>
              <span className="bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg text-xs text-blue-700">Skladište: <strong>{stats.skladiste}</strong></span>
              <span className="bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg text-xs text-red-700">Rashod: <strong>{stats.rashodovano}</strong></span>
            </div>
          )}

          {/* Search and Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
            <div className="flex gap-4 flex-wrap items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Pretraži..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <button
                onClick={() => setShowFilterBuilder(true)}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                <Filter size={14} /> Dodaj filter
              </button>
              {activeFilters.length > 0 && (
                <button onClick={clearAllFilters} className="text-xs text-red-500 hover:text-red-700">
                  Očisti filtere
                </button>
              )}
              {activeFilters.length > 0 && (
                <button
                  onClick={() => setShowSaveFilter(true)}
                  className="text-xs text-blue-500 hover:text-blue-700"
                >
                  Sačuvaj filter
                </button>
              )}
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
              >
                <Download size={14} /> Export CSV
              </button>
            </div>

            {/* Active Filters */}
            {activeFilters.length > 0 ? (
              <AlertBanner tone="info" className="mt-3">
                Dinamički filteri i CSV export primjenjuju se samo na trenutnu stranicu liste
                ({filteredEquipment.length} od {equipmentList.meta?.total ?? categoryEquipment.length} stavki u opsegu).
                Za pretragu cijele kategorije koristite polje „Pretraži”.
              </AlertBanner>
            ) : null}
            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                {activeFilters.map((filter, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-xs">
                    <strong>{filter.fieldName}</strong>
                    {' '}
                    {filter.operator === 'equals' && '='}
                    {filter.operator === 'contains' && 'sadrži'}
                    {filter.operator === 'startsWith' && 'počinje sa'}
                    {filter.operator === 'gt' && '>'}
                    {filter.operator === 'lt' && '<'}
                    {filter.operator === 'gte' && '≥'}
                    {filter.operator === 'lte' && '≤'}
                    {' '}
                    "{filter.value}"
                    <button onClick={() => removeFilter(i)} className="text-blue-500 hover:text-blue-700 ml-1">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">
              Prikazano: {filteredEquipment.length}
              {equipmentList.meta ? ` od ${equipmentList.meta.total}` : ''} stavki
            </p>
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => void openLabelPrint()}
                disabled={loadingLabels || selectedIds.size === 0}
                className="flex items-center gap-1 text-xs border px-2 py-1 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <Printer size={12} /> Štampaj ({selectedIds.size})
              </button>
            )}
          </div>

          {/* Equipment Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={
                          filteredEquipment.length > 0 &&
                          filteredEquipment.every((eq) => selectedIds.has(eq.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(filteredEquipment.map((eq) => eq.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                        aria-label="Odaberi sve"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">Inv. broj</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Zadužen na</th>
                    {selectedSub.fields.slice(0, 3).map(f => (
                      <th key={f.id} className="px-4 py-3 font-medium text-gray-600">{f.name}</th>
                    ))}
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">Akcije</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEquipment.map(eq => {
                    const holder = eq.currentHolder ?? null;
                    return (
                      <tr key={eq.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
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
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-medium text-gray-800">{eq.inventoryNumber}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(eq.status)}`}>
                            {getStatusLabel(eq.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {holder ? getEmployeeFullName(holder) : '—'}
                        </td>
                        {selectedSub.fields.slice(0, 3).map(f => (
                          <td key={f.id} className="px-4 py-3 text-xs text-gray-600">
                            {eq.specifications[f.id] || '—'}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleOpenEquipment(eq.id, true); }}
                              className="text-gray-500 hover:text-blue-600 p-1"
                              title="QR kod"
                            >
                              <QrCode size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleOpenEquipment(eq.id, false); }}
                              className="text-gray-500 hover:text-gray-700 p-1"
                              title="Detalji"
                            >
                              <Eye size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredEquipment.length === 0 && (
                    <tr>
                      <td colSpan={6 + Math.min(selectedSub.fields.length, 3)} className="text-center text-gray-400 py-12">
                        Nema rezultata
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {equipmentList.meta ? (
              <PaginationControls
                page={equipmentList.meta.page}
                pageSize={equipmentList.meta.pageSize}
                total={equipmentList.meta.total}
                totalPages={equipmentList.meta.totalPages}
                onPageChange={equipmentList.setPage}
                onPageSizeChange={equipmentList.setPageSize}
              />
            ) : null}
          </div>
        </>
      )}

      {/* Filter Builder Modal */}
      <ModalRoot open={showFilterBuilder} onClose={() => setShowFilterBuilder(false)} size="md">
        <div className="bg-white rounded-xl shadow-xl w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Dodaj filter</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Polje</label>
                <select
                  value={newFilterField}
                  onChange={e => setNewFilterField(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">— Odaberi polje —</option>
                  {availableFilterFields.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Operator</label>
                <select
                  value={newFilterOperator}
                  onChange={e => setNewFilterOperator(e.target.value as FilterCondition['operator'])}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="contains">Sadrži</option>
                  <option value="equals">Jednako</option>
                  <option value="startsWith">Počinje sa</option>
                  <option value="gt">Veće od (&gt;)</option>
                  <option value="lt">Manje od (&lt;)</option>
                  <option value="gte">Veće ili jednako (≥)</option>
                  <option value="lte">Manje ili jednako (≤)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vrijednost</label>
                <input
                  type="text"
                  value={newFilterValue}
                  onChange={e => setNewFilterValue(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Unesite vrijednost..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setShowFilterBuilder(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Odustani
              </button>
              <button type="button" onClick={addFilter} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Dodaj filter
              </button>
            </div>
        </div>
      </ModalRoot>

      {/* Save Filter Modal */}
      <ModalRoot open={showSaveFilter} onClose={() => setShowSaveFilter(false)} size="sm">
        <div className="bg-white rounded-xl shadow-xl w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Sačuvaj filter</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Naziv filtera</label>
              <input
                type="text"
                value={filterName}
                onChange={e => setFilterName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Npr. HP računari sa 16GB RAM"
              />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setShowSaveFilter(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Odustani
              </button>
              <button type="button" onClick={saveFilter} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Sačuvaj
              </button>
            </div>
        </div>
      </ModalRoot>

      {/* Equipment Card Modal */}
      {showLabels && labelItems.length > 0 ? (
        <LabelPrintSheet
          items={labelItems}
          categories={state.categories}
          onClose={() => {
            setShowLabels(false);
            setLabelItems([]);
          }}
        />
      ) : null}

      {viewItemId && (
        <EquipmentCard
          equipmentId={viewItemId}
          onClose={handleCloseEquipment}
          showTransferActions={admin || evidenticar}
          initialShowQR={viewShowQR}
        />
      )}
    </div>
  );
}
