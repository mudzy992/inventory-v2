import { useState } from 'react';
import { useStore } from '../useStore';
import { ChevronDown, ChevronRight, Building2, Plus, Edit2, Trash2, Users, Shield } from 'lucide-react';
import { getOrgUnitTypeLabel } from '../helpers';
import { cn } from '../utils/cn';
import { v4 as uuidv4 } from 'uuid';
import type { OrgUnit, OrgUnitType } from '../types';

function OrgTreeNode({ unit, level, state, onEdit, onDelete, onAdd }: {
  unit: OrgUnit;
  level: number;
  state: ReturnType<typeof useStore>[0];
  onEdit: (unit: OrgUnit) => void;
  onDelete: (id: string) => void;
  onAdd: (parentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(level < 2);
  const children = state.orgUnits.filter(o => o.parentId === unit.id);
  const employees = state.employees.filter(e => e.orgUnitId === unit.id);
  const signer = unit.signerId ? state.employees.find(e => e.id === unit.signerId) : null;
  const hasChildren = children.length > 0;

  const typeColors: Record<string, string> = {
    direkcija: 'border-l-blue-600 bg-blue-50',
    distribucija: 'border-l-purple-600 bg-purple-50',
    podrucje: 'border-l-teal-600 bg-teal-50',
    podruznica: 'border-l-orange-600 bg-orange-50',
    sektor: 'border-l-green-600 bg-green-50',
    sluzba: 'border-l-yellow-600 bg-yellow-50',
    odjeljenje: 'border-l-gray-600 bg-gray-50',
  };

  const badgeColors: Record<string, string> = {
    direkcija: 'bg-blue-100 text-blue-700',
    distribucija: 'bg-purple-100 text-purple-700',
    podrucje: 'bg-teal-100 text-teal-700',
    podruznica: 'bg-orange-100 text-orange-700',
    sektor: 'bg-green-100 text-green-700',
    sluzba: 'bg-yellow-100 text-yellow-700',
    odjeljenje: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className={cn('ml-0', level > 0 && 'ml-6')}>
      <div className={cn(
        'border-l-4 rounded-r-lg mb-1 transition-colors',
        typeColors[unit.type] || 'border-l-gray-300 bg-gray-50'
      )}>
        <div className="flex items-center gap-2 px-3 py-2 group">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0 w-5"
          >
            {hasChildren || employees.length > 0
              ? (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />)
              : <span className="w-4" />
            }
          </button>
          <Building2 size={16} className="text-gray-400 flex-shrink-0" />
          <span className="font-medium text-sm text-gray-800 flex-1">{unit.name}</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', badgeColors[unit.type] || 'bg-gray-100 text-gray-600')}>
            {getOrgUnitTypeLabel(unit.type)}
          </span>
          {signer && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 flex items-center gap-1">
              <Shield size={10} /> {signer.firstName} {signer.lastName}
            </span>
          )}
          <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
            <Users size={10} />{employees.length}
          </span>
          <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
            <button onClick={() => onAdd(unit.id)} className="text-green-500 hover:text-green-700 p-0.5" title="Dodaj podjedinicu">
              <Plus size={14} />
            </button>
            <button onClick={() => onEdit(unit)} className="text-blue-500 hover:text-blue-700 p-0.5" title="Uredi">
              <Edit2 size={14} />
            </button>
            {children.length === 0 && employees.length === 0 && (
              <button onClick={() => onDelete(unit.id)} className="text-red-500 hover:text-red-700 p-0.5" title="Obriši">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        {expanded && employees.length > 0 && (
          <div className="px-10 pb-2">
            {employees.map(emp => (
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
        <OrgTreeNode key={child.id} unit={child} level={level + 1} state={state} onEdit={onEdit} onDelete={onDelete} onAdd={onAdd} />
      ))}
    </div>
  );
}

export function OrganizationPage() {
  const [state, setState] = useStore();
  const [editingUnit, setEditingUnit] = useState<OrgUnit | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formParentId, setFormParentId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<OrgUnitType>('sektor');
  const [formSignerId, setFormSignerId] = useState('');

  const rootUnits = state.orgUnits.filter(o => o.parentId === null);

  function openAdd(parentId: string) {
    setEditingUnit(null);
    setFormParentId(parentId);
    setFormName('');
    setFormType('sektor');
    setFormSignerId('');
    setShowForm(true);
  }

  function openEdit(unit: OrgUnit) {
    setEditingUnit(unit);
    setFormParentId(unit.parentId);
    setFormName(unit.name);
    setFormType(unit.type);
    setFormSignerId(unit.signerId || '');
    setShowForm(true);
  }

  function handleSave() {
    if (!formName.trim()) return;
    if (editingUnit) {
      setState(prev => ({
        ...prev,
        orgUnits: prev.orgUnits.map(o =>
          o.id === editingUnit.id
            ? { ...o, name: formName.trim(), type: formType, signerId: formSignerId || undefined }
            : o
        ),
      }));
    } else {
      const newUnit: OrgUnit = {
        id: uuidv4(),
        name: formName.trim(),
        type: formType,
        parentId: formParentId,
        signerId: formSignerId || undefined,
      };
      setState(prev => ({
        ...prev,
        orgUnits: [...prev.orgUnits, newUnit],
      }));
    }
    setShowForm(false);
  }

  function handleDelete(id: string) {
    if (!confirm('Da li ste sigurni da želite obrisati ovu organizacijsku jedinicu?')) return;
    setState(prev => ({
      ...prev,
      orgUnits: prev.orgUnits.filter(o => o.id !== id),
    }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizacijska struktura</h1>
          <p className="text-gray-500 mt-1">Hijerarhija preduzeća — direkcija, distribucije, područja, podružnice</p>
        </div>
        <button
          onClick={() => {
            setEditingUnit(null);
            setFormParentId(null);
            setFormName('');
            setFormType('direkcija');
            setFormSignerId('');
            setShowForm(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus size={16} /> Nova jedinica
        </button>
      </div>

      {/* Tree */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {rootUnits.map(unit => (
          <OrgTreeNode key={unit.id} unit={unit} level={0} state={state} onEdit={openEdit} onDelete={handleDelete} onAdd={openAdd} />
        ))}
        {rootUnits.length === 0 && (
          <p className="text-center text-gray-400 py-12">Nema organizacijskih jedinica. Dodajte prvu.</p>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">
                {editingUnit ? 'Uredi organizacijsku jedinicu' : 'Nova organizacijska jedinica'}
              </h2>
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
                  value={formType}
                  onChange={e => setFormType(e.target.value as OrgUnitType)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="direkcija">Direkcija</option>
                  <option value="distribucija">Distribucija</option>
                  <option value="podrucje">Područje</option>
                  <option value="podruznica">Podružnica</option>
                  <option value="sektor">Sektor</option>
                  <option value="sluzba">Služba</option>
                  <option value="odjeljenje">Odjeljenje</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nadređena jedinica</label>
                <select
                  value={formParentId || ''}
                  onChange={e => setFormParentId(e.target.value || null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">— Krovni nivo (nema nadređenu) —</option>
                  {state.orgUnits
                    .filter(o => o.id !== editingUnit?.id)
                    .map(o => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({getOrgUnitTypeLabel(o.type)})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Potpisnik (ovlaštena osoba)</label>
                <select
                  value={formSignerId}
                  onChange={e => setFormSignerId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">— Bez potpisnika (nasljeđuje od nadređene) —</option>
                  {state.employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} — {emp.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Odustani
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                {editingUnit ? 'Sačuvaj izmjene' : 'Dodaj'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
