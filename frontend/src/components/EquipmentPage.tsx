import { useState, useMemo } from 'react';
import { useStore } from '../useStore';
import { Plus, Search, Eye, Edit2, Filter, QrCode } from 'lucide-react';
import { getStatusLabel, getStatusColor, formatDate, getEmployeeFullName } from '../helpers';
import { v4 as uuidv4 } from 'uuid';
import type { Equipment } from '../types';
import { EquipmentCard } from './EquipmentCard';

export function EquipmentPage() {
  const [state, setState] = useStore();
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [viewItemId, setViewItemId] = useState<string | null>(null);

  // Form state
  const [fCategoryId, setFCategoryId] = useState('');
  const [fInventoryNumber, setFInventoryNumber] = useState('');
  const [fSpecs, setFSpecs] = useState<Record<string, string>>({});
  const [fContract, setFContract] = useState('');
  const [fEntryDate, setFEntryDate] = useState('');
  const [fNotes, setFNotes] = useState('');

  const filtered = useMemo(() => {
    return state.equipment.filter(eq => {
      const cat = state.categories.find(c => c.id === eq.categoryId);
      const holder = eq.currentHolderId ? state.employees.find(e => e.id === eq.currentHolderId) : null;
      const searchStr = `${eq.inventoryNumber} ${cat?.name || ''} ${holder ? `${holder.firstName} ${holder.lastName}` : ''} ${Object.values(eq.specifications).join(' ')}`.toLowerCase();
      
      const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
      const matchCat = filterCategory === '' || eq.categoryId === filterCategory;
      const matchStatus = filterStatus === '' || eq.status === filterStatus;
      return matchSearch && matchCat && matchStatus;
    });
  }, [state.equipment, state.categories, state.employees, search, filterCategory, filterStatus]);

  const selectedCategory = state.categories.find(c => c.id === fCategoryId);

  function openAdd() {
    setEditing(null);
    const firstCat = state.categories[0];
    setFCategoryId(firstCat?.id || '');
    setFInventoryNumber('');
    setFSpecs({});
    setFContract('');
    setFEntryDate(new Date().toISOString().slice(0, 10));
    setFNotes('');
    setShowForm(true);
  }

  function openEdit(eq: Equipment) {
    setEditing(eq);
    setFCategoryId(eq.categoryId);
    setFInventoryNumber(eq.inventoryNumber);
    setFSpecs({ ...eq.specifications });
    setFContract(eq.contractNumber || '');
    setFEntryDate(eq.entryDate);
    setFNotes(eq.notes || '');
    setShowForm(true);
  }

  function handleSave() {
    if (!fCategoryId || !fInventoryNumber.trim()) return;

    const existing = state.equipment.find(e => e.inventoryNumber === fInventoryNumber.trim() && e.id !== editing?.id);
    if (existing) {
      alert('Inventurni broj već postoji!');
      return;
    }

    const cat = state.categories.find(c => c.id === fCategoryId);
    if (cat) {
      const allFields = [...cat.fields, ...cat.optionalFields];
      for (const field of allFields) {
        if (field.unique && fSpecs[field.id]) {
          const duplicate = state.equipment.find(e =>
            e.id !== editing?.id &&
            e.categoryId === fCategoryId &&
            e.specifications[field.id] === fSpecs[field.id]
          );
          if (duplicate) {
            alert(`Polje "${field.name}" mora biti unikatno! Vrijednost "${fSpecs[field.id]}" već postoji.`);
            return;
          }
        }
      }
    }

    if (editing) {
      setState(prev => ({
        ...prev,
        equipment: prev.equipment.map(e =>
          e.id === editing.id
            ? {
                ...e,
                categoryId: fCategoryId,
                inventoryNumber: fInventoryNumber.trim(),
                specifications: fSpecs,
                contractNumber: fContract || undefined,
                entryDate: fEntryDate,
                notes: fNotes || undefined,
              }
            : e
        ),
      }));
    } else {
      const newEq: Equipment = {
        id: uuidv4(),
        categoryId: fCategoryId,
        inventoryNumber: fInventoryNumber.trim(),
        specifications: fSpecs,
        status: 'skladiste',
        contractNumber: fContract || undefined,
        entryDate: fEntryDate,
        notes: fNotes || undefined,
      };
      setState(prev => ({ ...prev, equipment: [...prev.equipment, newEq] }));
    }
    setShowForm(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Oprema</h1>
          <p className="text-gray-500 mt-1">Evidencija kompletne opreme — skladište, zaduženja, rashod</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus size={16} /> Nova oprema
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex gap-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Pretraži po inv. broju, serijskom broju, osobi..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
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
      <div className="flex gap-3 mb-4 text-xs">
        <span className="bg-white border border-gray-200 px-3 py-1.5 rounded-lg">Prikazano: <strong>{filtered.length}</strong> od {state.equipment.length}</span>
        <span className="bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg text-blue-700">Skladište: <strong>{filtered.filter(e => e.status === 'skladiste').length}</strong></span>
        <span className="bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg text-green-700">Zaduženo: <strong>{filtered.filter(e => e.status === 'zaduzeno').length}</strong></span>
        <span className="bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg text-red-700">Rashod: <strong>{filtered.filter(e => e.status === 'rashodovano').length}</strong></span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
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
                        <button onClick={() => setViewItemId(eq.id)} className="text-gray-500 hover:text-blue-600 p-1" title="Pogledaj detalje / QR">
                          <QrCode size={14} />
                        </button>
                        <button onClick={() => setViewItemId(eq.id)} className="text-gray-500 hover:text-gray-700 p-1" title="Pogledaj detalje">
                          <Eye size={14} />
                        </button>
                        {eq.status !== 'rashodovano' && (
                          <button onClick={() => openEdit(eq)} className="text-blue-500 hover:text-blue-700 p-1" title="Uredi">
                            <Edit2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center text-gray-400 py-12">Nema rezultata</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Equipment Card Modal with QR */}
      {viewItemId && (
        <EquipmentCard
          equipmentId={viewItemId}
          onClose={() => setViewItemId(null)}
          showTransferActions={true}
        />
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">{editing ? 'Uredi opremu' : 'Nova oprema — prijem na skladište'}</h2>
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
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50">Odustani</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                {editing ? 'Sačuvaj' : 'Dodaj na skladište'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
