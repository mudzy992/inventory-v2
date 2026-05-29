import { useState, useMemo } from 'react';
import { useStore } from '../useStore';
import { Plus, Edit2, Trash2, Search, Package } from 'lucide-react';
import { getOrgUnitPath, getOrgUnitTypeLabel } from '../helpers';
import { v4 as uuidv4 } from 'uuid';
import type { Employee } from '../types';

export function EmployeesPage() {
  const [state, setState] = useStore();
  const [search, setSearch] = useState('');
  const [filterOrgUnit, setFilterOrgUnit] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const [fFirstName, setFFirstName] = useState('');
  const [fLastName, setFLastName] = useState('');
  const [fTitle, setFTitle] = useState('');
  const [fOrgUnit, setFOrgUnit] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fPhone, setFPhone] = useState('');

  const filtered = useMemo(() => {
    return state.employees.filter(emp => {
      const matchSearch = search === '' ||
        `${emp.firstName} ${emp.lastName} ${emp.title} ${emp.email || ''}`.toLowerCase().includes(search.toLowerCase());
      const matchOrg = filterOrgUnit === '' || emp.orgUnitId === filterOrgUnit;
      return matchSearch && matchOrg;
    });
  }, [state.employees, search, filterOrgUnit]);

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

  function handleSave() {
    if (!fFirstName.trim() || !fLastName.trim() || !fOrgUnit) return;
    if (editing) {
      setState(prev => ({
        ...prev,
        employees: prev.employees.map(e =>
          e.id === editing.id
            ? { ...e, firstName: fFirstName.trim(), lastName: fLastName.trim(), title: fTitle.trim(), orgUnitId: fOrgUnit, email: fEmail || undefined, phone: fPhone || undefined }
            : e
        ),
      }));
    } else {
      const newEmp: Employee = {
        id: uuidv4(),
        firstName: fFirstName.trim(),
        lastName: fLastName.trim(),
        title: fTitle.trim(),
        orgUnitId: fOrgUnit,
        email: fEmail || undefined,
        phone: fPhone || undefined,
      };
      setState(prev => ({ ...prev, employees: [...prev.employees, newEmp] }));
    }
    setShowForm(false);
  }

  function handleDelete(id: string) {
    const hasEquipment = state.equipment.some(e => e.currentHolderId === id);
    if (hasEquipment) {
      alert('Nije moguće obrisati radnika koji ima zaduženu opremu. Prvo razdužite opremu.');
      return;
    }
    if (!confirm('Da li ste sigurni?')) return;
    setState(prev => ({ ...prev, employees: prev.employees.filter(e => e.id !== id) }));
  }

  function getEquipmentCount(empId: string): number {
    return state.equipment.filter(e => e.currentHolderId === empId && e.status === 'zaduzeno').length;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Radnici</h1>
          <p className="text-gray-500 mt-1">Evidencija radnika po organizacijskim jedinicama</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus size={16} /> Novi radnik
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
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
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[200px]"
        >
          <option value="">Sve org. jedinice</option>
          {state.orgUnits.map(o => (
            <option key={o.id} value={o.id}>{o.name} ({getOrgUnitTypeLabel(o.type)})</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Ime i prezime</th>
                <th className="px-4 py-3 font-medium text-gray-600">Pozicija</th>
                <th className="px-4 py-3 font-medium text-gray-600">Org. jedinica</th>
                <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-center">Oprema</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => {
                const orgUnit = state.orgUnits.find(o => o.id === emp.orgUnitId);
                const eqCount = getEquipmentCount(emp.id);
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
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(emp)} className="text-blue-500 hover:text-blue-700 p-1" title="Uredi">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(emp.id)} className="text-red-500 hover:text-red-700 p-1" title="Obriši">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-12">Nema rezultata</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">{editing ? 'Uredi radnika' : 'Novi radnik'}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                <input type="text" value={fTitle} onChange={e => setFTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Npr. Stručni saradnik" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Org. jedinica *</label>
                <select value={fOrgUnit} onChange={e => setFOrgUnit(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                  <option value="">— Odaberi —</option>
                  {state.orgUnits.map(o => (
                    <option key={o.id} value={o.id}>{o.name} ({getOrgUnitTypeLabel(o.type)})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
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
