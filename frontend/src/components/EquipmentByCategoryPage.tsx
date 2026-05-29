import { useState, useMemo } from 'react';
import { useStore } from '../useStore';
import { getParentCategories, getSubCategories, getEquipmentStats, isAdmin, isEvidenticar, getManagedOrgUnitIds } from '../store';
import { ChevronRight, Folder, Layers, Search, Filter, Download, X, Eye, QrCode } from 'lucide-react';
import { getStatusLabel, getStatusColor, getEmployeeFullName } from '../helpers';
import { EquipmentCard } from './EquipmentCard';
import type { FilterCondition } from '../types';
import { v4 as uuidv4 } from 'uuid';

export function EquipmentByCategoryPage() {
  const [state, setState] = useStore();
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [viewItemId, setViewItemId] = useState<string | null>(null);
  
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
  const managedOrgUnitIds = getManagedOrgUnitIds();

  const parentCategories = getParentCategories();
  const selectedParent = parentCategories.find(p => p.id === selectedParentId);
  const subCategories = selectedParentId ? getSubCategories(selectedParentId) : [];
  const selectedSub = subCategories.find(s => s.id === selectedSubId);

  // Get equipment for selected category
  const categoryEquipment = useMemo(() => {
    if (!selectedSubId) return [];
    
    let items = state.equipment.filter(e => e.categoryId === selectedSubId);
    
    // Filter by managed org units for evidenticar
    if (evidenticar && !admin) {
      items = items.filter(e => {
        if (e.status === 'skladiste') return true;
        if (!e.currentHolderId) return true;
        const holder = state.employees.find(emp => emp.id === e.currentHolderId);
        return holder && managedOrgUnitIds.includes(holder.orgUnitId);
      });
    }
    
    return items;
  }, [state.equipment, selectedSubId, evidenticar, admin, managedOrgUnitIds, state.employees]);

  // Apply dynamic filters
  const filteredEquipment = useMemo(() => {
    let items = categoryEquipment;
    
    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(e => {
        const holder = e.currentHolderId ? state.employees.find(emp => emp.id === e.currentHolderId) : null;
        const searchStr = `${e.inventoryNumber} ${Object.values(e.specifications).join(' ')} ${holder ? `${holder.firstName} ${holder.lastName}` : ''}`.toLowerCase();
        return searchStr.includes(query);
      });
    }
    
    // Apply active filters
    for (const filter of activeFilters) {
      items = items.filter(e => {
        let value: string;
        
        if (filter.fieldId === 'status') {
          value = e.status;
        } else if (filter.fieldId === 'inventoryNumber') {
          value = e.inventoryNumber;
        } else if (filter.fieldId === 'contractNumber') {
          value = e.contractNumber || '';
        } else if (filter.fieldId === 'currentHolder') {
          const holder = e.currentHolderId ? state.employees.find(emp => emp.id === e.currentHolderId) : null;
          value = holder ? `${holder.firstName} ${holder.lastName}` : '';
        } else {
          value = e.specifications[filter.fieldId] || '';
        }
        
        const filterVal = filter.value.toLowerCase();
        const itemVal = value.toLowerCase();
        
        switch (filter.operator) {
          case 'equals': return itemVal === filterVal;
          case 'contains': return itemVal.includes(filterVal);
          case 'startsWith': return itemVal.startsWith(filterVal);
          case 'gt': return parseFloat(value) > parseFloat(filter.value);
          case 'lt': return parseFloat(value) < parseFloat(filter.value);
          case 'gte': return parseFloat(value) >= parseFloat(filter.value);
          case 'lte': return parseFloat(value) <= parseFloat(filter.value);
          default: return true;
        }
      });
    }
    
    return items;
  }, [categoryEquipment, searchQuery, activeFilters, state.employees]);

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
    
    const user = state.users.find(u => u.id === state.currentUserId);
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

  function exportToCSV() {
    if (!selectedSub || filteredEquipment.length === 0) return;
    
    const headers = ['Inventurni broj', 'Status', 'Zadužen na', 'Ugovor', 'Datum ulaza'];
    selectedSub.fields.forEach(f => headers.push(f.name));
    selectedSub.optionalFields.forEach(f => headers.push(f.name));
    
    const rows = filteredEquipment.map(e => {
      const holder = e.currentHolderId ? state.employees.find(emp => emp.id === e.currentHolderId) : null;
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
  const stats = selectedSubId ? getEquipmentStats(selectedSubId, evidenticar && !admin ? managedOrgUnitIds : undefined) : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Oprema po kategorijama</h1>
        <p className="text-gray-500 mt-1">Pregled i filtriranje opreme organizovano po kategorijama</p>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <button 
          onClick={() => { setSelectedParentId(null); setSelectedSubId(null); }}
          className={`${!selectedParentId ? 'text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Sve kategorije
        </button>
        {selectedParent && (
          <>
            <ChevronRight size={14} className="text-gray-400" />
            <button 
              onClick={() => setSelectedSubId(null)}
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
              const parentStats = getEquipmentStats(parent.id, evidenticar && !admin ? managedOrgUnitIds : undefined);
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
              const subStats = getEquipmentStats(sub.id, evidenticar && !admin ? managedOrgUnitIds : undefined);
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
                        {subStats.rawTransfers > 0 && (
                          <span className="text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded">{subStats.rawTransfers} na potpisu</span>
                        )}
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
              <span className="bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-lg text-xs text-yellow-700">Na potpisu: <strong>{stats.rawTransfers}</strong></span>
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

          {/* Results count */}
          <p className="text-xs text-gray-500 mb-2">
            Prikazano: {filteredEquipment.length} {filteredEquipment.length !== categoryEquipment.length && `od ${categoryEquipment.length}`} stavki
          </p>

          {/* Equipment Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
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
                    const holder = eq.currentHolderId ? state.employees.find(e => e.id === eq.currentHolderId) : null;
                    return (
                      <tr key={eq.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
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
                            <button onClick={() => setViewItemId(eq.id)} className="text-gray-500 hover:text-blue-600 p-1" title="QR / Detalji">
                              <QrCode size={14} />
                            </button>
                            <button onClick={() => setViewItemId(eq.id)} className="text-gray-500 hover:text-gray-700 p-1" title="Detalji">
                              <Eye size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredEquipment.length === 0 && (
                    <tr>
                      <td colSpan={5 + Math.min(selectedSub.fields.length, 3)} className="text-center text-gray-400 py-12">
                        Nema rezultata
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Filter Builder Modal */}
      {showFilterBuilder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowFilterBuilder(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
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
              <button onClick={() => setShowFilterBuilder(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Odustani
              </button>
              <button onClick={addFilter} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Dodaj filter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Filter Modal */}
      {showSaveFilter && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowSaveFilter(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
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
              <button onClick={() => setShowSaveFilter(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Odustani
              </button>
              <button onClick={saveFilter} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Sačuvaj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Equipment Card Modal */}
      {viewItemId && (
        <EquipmentCard
          equipmentId={viewItemId}
          onClose={() => setViewItemId(null)}
          showTransferActions={admin || evidenticar}
        />
      )}
    </div>
  );
}
