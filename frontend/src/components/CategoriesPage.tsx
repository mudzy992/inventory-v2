import { useState } from 'react';
import { useStore } from '../useStore';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Settings, Folder, FolderOpen, Layers } from 'lucide-react';
import { getParentCategories, getSubCategories, getEquipmentStats } from '../store';
import { v4 as uuidv4 } from 'uuid';
import type { Category, CategoryField } from '../types';

function FieldEditor({ fields, onChange, label }: { fields: CategoryField[]; onChange: (fields: CategoryField[]) => void; label: string }) {
  function addField() {
    onChange([...fields, { id: uuidv4(), name: '', type: 'text', required: false, unique: false }]);
  }

  function updateField(index: number, update: Partial<CategoryField>) {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...update };
    onChange(newFields);
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <button onClick={addField} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
          <Plus size={12} /> Dodaj polje
        </button>
      </div>
      <div className="space-y-2">
        {fields.map((field, i) => (
          <div key={field.id} className="flex gap-2 items-start bg-gray-50 rounded-lg p-2 flex-wrap">
            <input
              type="text"
              value={field.name}
              onChange={e => updateField(i, { name: e.target.value })}
              placeholder="Naziv polja"
              className="flex-1 min-w-[120px] border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <select
              value={field.type}
              onChange={e => updateField(i, { type: e.target.value as CategoryField['type'] })}
              className="border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="text">Tekst</option>
              <option value="number">Broj</option>
              <option value="date">Datum</option>
              <option value="select">Izbor</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
              <input type="checkbox" checked={field.required} onChange={e => updateField(i, { required: e.target.checked })} className="rounded" />
              Obavezno
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
              <input type="checkbox" checked={field.unique} onChange={e => updateField(i, { unique: e.target.checked })} className="rounded" />
              Unikat
            </label>
            <button onClick={() => removeField(i)} className="text-red-400 hover:text-red-600 p-1 flex-shrink-0">
              <Trash2 size={12} />
            </button>
            {field.type === 'select' && (
              <input
                type="text"
                value={(field.options || []).join(', ')}
                onChange={e => updateField(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                placeholder="Opcije (razdvojene zarezom)"
                className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            )}
          </div>
        ))}
        {fields.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">Nema polja</p>
        )}
      </div>
    </div>
  );
}

export function CategoriesPage() {
  const [state, setState] = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);

  const [fName, setFName] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fParentId, setFParentId] = useState<string | null>(null);
  const [fFields, setFFields] = useState<CategoryField[]>([]);
  const [fOptFields, setFOptFields] = useState<CategoryField[]>([]);

  const parentCategories = getParentCategories();

  function openAddParent() {
    setEditing(null);
    setFName('');
    setFDesc('');
    setFParentId(null);
    setFFields([]);
    setFOptFields([]);
    setShowForm(true);
  }

  function openAddSub(parentId: string) {
    setEditing(null);
    setFName('');
    setFDesc('');
    setFParentId(parentId);
    setFFields([
      { id: uuidv4(), name: 'Serijski broj', type: 'text', required: true, unique: true },
    ]);
    setFOptFields([]);
    setShowForm(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setFName(cat.name);
    setFDesc(cat.description);
    setFParentId(cat.parentId);
    setFFields([...cat.fields]);
    setFOptFields([...cat.optionalFields]);
    setShowForm(true);
  }

  function handleSave() {
    if (!fName.trim()) return;
    if (editing) {
      setState(prev => ({
        ...prev,
        categories: prev.categories.map(c =>
          c.id === editing.id
            ? { ...c, name: fName.trim(), description: fDesc.trim(), parentId: fParentId, fields: fFields, optionalFields: fOptFields }
            : c
        ),
      }));
    } else {
      const newCat: Category = {
        id: uuidv4(),
        name: fName.trim(),
        description: fDesc.trim(),
        parentId: fParentId,
        fields: fFields,
        optionalFields: fOptFields,
      };
      setState(prev => ({ ...prev, categories: [...prev.categories, newCat] }));
    }
    setShowForm(false);
  }

  function handleDelete(id: string) {
    const hasEquipment = state.equipment.some(e => e.categoryId === id);
    const hasSubCategories = state.categories.some(c => c.parentId === id);
    
    if (hasEquipment) {
      alert('Nije moguće obrisati kategoriju koja sadrži opremu.');
      return;
    }
    if (hasSubCategories) {
      alert('Nije moguće obrisati kategoriju koja ima podkategorije. Prvo obrišite podkategorije.');
      return;
    }
    if (!confirm('Obrisati ovu kategoriju?')) return;
    setState(prev => ({ ...prev, categories: prev.categories.filter(c => c.id !== id) }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kategorije opreme</h1>
          <p className="text-gray-500 mt-1">Hijerarhija kategorija — glavne kategorije i podkategorije</p>
        </div>
        <button onClick={openAddParent} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus size={16} /> Nova glavna kategorija
        </button>
      </div>

      <div className="space-y-4">
        {parentCategories.map(parent => {
          const subCategories = getSubCategories(parent.id);
          const isExpanded = expandedParentId === parent.id;
          const stats = getEquipmentStats(parent.id);

          return (
            <div key={parent.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Parent Category Header */}
              <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors bg-gradient-to-r from-blue-50 to-transparent"
                onClick={() => setExpandedParentId(isExpanded ? null : parent.id)}
              >
                {isExpanded ? <FolderOpen size={20} className="text-blue-500" /> : <Folder size={20} className="text-blue-400" />}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800">{parent.name}</h3>
                  <p className="text-xs text-gray-500">{parent.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                    {subCategories.length} podkategorija
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {stats.total} stavki
                  </span>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openAddSub(parent.id)} className="text-green-500 hover:text-green-700 p-1" title="Dodaj podkategoriju">
                      <Plus size={14} />
                    </button>
                    <button onClick={() => openEdit(parent)} className="text-blue-500 hover:text-blue-700 p-1"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(parent.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14} /></button>
                  </div>
                  {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                </div>
              </div>

              {/* Sub Categories */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {subCategories.length > 0 ? (
                    <div className="divide-y divide-gray-50">
                      {subCategories.map(sub => {
                        const subStats = getEquipmentStats(sub.id);
                        return (
                          <div key={sub.id} className="px-5 py-3 hover:bg-gray-50 transition-colors ml-6">
                            <div className="flex items-center gap-3">
                              <Layers size={16} className="text-gray-400" />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-gray-700">{sub.name}</h4>
                                <p className="text-xs text-gray-400">{sub.description}</p>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{sub.fields.length} polja</span>
                                <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{subStats.total} kom</span>
                                <span className="bg-green-50 text-green-600 px-2 py-0.5 rounded">{subStats.zaduzeno} zaduž.</span>
                                <span className="bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded">{subStats.rawTransfers} na potpisu</span>
                              </div>
                              <div className="flex gap-1">
                                <button onClick={() => openEdit(sub)} className="text-blue-500 hover:text-blue-700 p-1"><Edit2 size={14} /></button>
                                <button onClick={() => handleDelete(sub.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14} /></button>
                              </div>
                            </div>
                            {/* Field preview */}
                            <div className="mt-2 flex flex-wrap gap-1 ml-6">
                              {sub.fields.slice(0, 5).map(f => (
                                <span key={f.id} className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-500">
                                  {f.name}
                                  {f.unique && <span className="text-purple-500 ml-0.5">●</span>}
                                  {f.required && <span className="text-red-400 ml-0.5">*</span>}
                                </span>
                              ))}
                              {sub.fields.length > 5 && (
                                <span className="text-[10px] text-gray-400">+{sub.fields.length - 5} više</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-5 py-8 text-center text-gray-400 text-sm">
                      Nema podkategorija.{' '}
                      <button onClick={() => openAddSub(parent.id)} className="text-blue-500 hover:underline">
                        Dodaj prvu podkategoriju
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {parentCategories.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
            Nema kategorija. Dodajte prvu glavnu kategoriju opreme.
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">
                {editing 
                  ? (editing.parentId ? 'Uredi podkategoriju' : 'Uredi glavnu kategoriju')
                  : (fParentId ? 'Nova podkategorija' : 'Nova glavna kategorija')
                }
              </h2>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Naziv *</label>
                <input type="text" value={fName} onChange={e => setFName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder={fParentId ? "Npr. Radna stanica" : "Npr. Računarska oprema"} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opis</label>
                <textarea value={fDesc} onChange={e => setFDesc(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  rows={2} placeholder="Opis kategorije..." />
              </div>

              {/* Parent selector - only for sub-categories */}
              {(fParentId || (!editing && parentCategories.length > 0)) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Glavna kategorija</label>
                  <select 
                    value={fParentId || ''} 
                    onChange={e => setFParentId(e.target.value || null)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">— Bez glavne kategorije (ovo je glavna kategorija) —</option>
                    {parentCategories.filter(p => p.id !== editing?.id).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Fields - only for sub-categories */}
              {(fParentId || (editing && editing.parentId)) && (
                <>
                  <FieldEditor fields={fFields} onChange={setFFields} label="Obavezna polja (specifikacije)" />
                  <FieldEditor fields={fOptFields} onChange={setFOptFields} label="Opcionalna polja" />
                </>
              )}

              {!fParentId && !editing?.parentId && (
                <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
                  <Settings size={16} className="inline mr-2" />
                  Glavne kategorije služe za grupiranje podkategorija i nemaju vlastita polja za specifikacije.
                  Polja se definiraju na nivou podkategorija.
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50">Odustani</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                {editing ? 'Sačuvaj' : 'Dodaj'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
