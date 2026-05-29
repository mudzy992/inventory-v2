import { useState } from 'react';
import { useStore } from '../useStore';
import { User, Shield, ClipboardList, Edit2, Search, Check, X, Building2 } from 'lucide-react';
import { getEmployeeFullName, getOrgUnitTypeLabel } from '../helpers';
import type { UserRole } from '../types';

export function UserManagementPage() {
  const [state, setState] = useStore();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  
  // Edit form state
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [editManagedUnits, setEditManagedUnits] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState(true);

  const filteredUsers = state.users.filter(user => {
    const emp = state.employees.find(e => e.id === user.employeeId);
    if (!emp) return false;
    
    const matchSearch = search === '' || 
      `${emp.firstName} ${emp.lastName} ${user.username}`.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === '' || user.role === filterRole;
    
    return matchSearch && matchRole;
  });

  function openEdit(userId: string) {
    const user = state.users.find(u => u.id === userId);
    if (!user) return;
    
    setEditRole(user.role);
    setEditManagedUnits(user.managedOrgUnitIds || []);
    setEditIsActive(user.isActive);
    setEditingUserId(userId);
  }

  function saveUser() {
    if (!editingUserId) return;
    
    setState(prev => ({
      ...prev,
      users: prev.users.map(u => 
        u.id === editingUserId
          ? {
              ...u,
              role: editRole,
              managedOrgUnitIds: editRole === 'evidenticar' ? editManagedUnits : undefined,
              isActive: editIsActive,
            }
          : u
      ),
    }));
    
    setEditingUserId(null);
  }

  function toggleManagedUnit(unitId: string) {
    if (editManagedUnits.includes(unitId)) {
      setEditManagedUnits(editManagedUnits.filter(id => id !== unitId));
    } else {
      setEditManagedUnits([...editManagedUnits, unitId]);
    }
  }

  const roleLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    admin: { label: 'Administrator', color: 'bg-amber-100 text-amber-800', icon: <Shield size={12} /> },
    evidenticar: { label: 'Evidentičar', color: 'bg-purple-100 text-purple-800', icon: <ClipboardList size={12} /> },
    user: { label: 'Korisnik', color: 'bg-gray-100 text-gray-800', icon: <User size={12} /> },
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Upravljanje korisnicima</h1>
        <p className="text-gray-500 mt-1">Dodjeljivanje uloga i upravljanje pristupom</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex gap-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pretraži korisnike..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          <option value="">Sve uloge</option>
          <option value="admin">Administrator</option>
          <option value="evidenticar">Evidentičar</option>
          <option value="user">Korisnik</option>
        </select>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-4 text-xs">
        <span className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-amber-700">
          Administratori: <strong>{state.users.filter(u => u.role === 'admin').length}</strong>
        </span>
        <span className="bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg text-purple-700">
          Evidentičari: <strong>{state.users.filter(u => u.role === 'evidenticar').length}</strong>
        </span>
        <span className="bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg text-gray-700">
          Korisnici: <strong>{state.users.filter(u => u.role === 'user').length}</strong>
        </span>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Korisnik</th>
                <th className="px-4 py-3 font-medium text-gray-600">Korisničko ime</th>
                <th className="px-4 py-3 font-medium text-gray-600">Uloga</th>
                <th className="px-4 py-3 font-medium text-gray-600">Upravljane jedinice</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => {
                const emp = state.employees.find(e => e.id === user.employeeId);
                if (!emp) return null;
                
                const role = roleLabels[user.role];
                const managedUnits = user.managedOrgUnitIds 
                  ? user.managedOrgUnitIds.map(id => state.orgUnits.find(o => o.id === id)).filter(Boolean)
                  : [];
                
                return (
                  <tr key={user.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-medium text-gray-600">
                          {emp.firstName[0]}{emp.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{getEmployeeFullName(emp)}</p>
                          <p className="text-xs text-gray-400">{emp.title}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{user.username}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${role.color}`}>
                        {role.icon} {role.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {managedUnits.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {managedUnits.slice(0, 2).map(unit => (
                            <span key={unit!.id} className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                              {unit!.name}
                            </span>
                          ))}
                          {managedUnits.length > 2 && (
                            <span className="text-xs text-gray-400">+{managedUnits.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {user.isActive ? 'Aktivan' : 'Neaktivan'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openEdit(user.id)}
                        className="text-blue-500 hover:text-blue-700 p-1"
                        title="Uredi"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-12">Nema rezultata</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingUserId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditingUserId(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {(() => {
              const user = state.users.find(u => u.id === editingUserId);
              const emp = user ? state.employees.find(e => e.id === user.employeeId) : null;
              if (!user || !emp) return null;
              
              return (
                <>
                  <div className="p-6 border-b border-gray-100">
                    <h2 className="text-lg font-semibold">Uredi korisnika</h2>
                    <p className="text-sm text-gray-500">{getEmployeeFullName(emp)}</p>
                  </div>
                  <div className="p-6 space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Uloga</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['admin', 'evidenticar', 'user'] as const).map(role => (
                          <button
                            key={role}
                            onClick={() => setEditRole(role)}
                            className={`p-3 rounded-lg border-2 text-center transition-all ${
                              editRole === role 
                                ? 'border-blue-500 bg-blue-50' 
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex justify-center mb-1">
                              {roleLabels[role].icon}
                            </div>
                            <span className="text-xs font-medium">{roleLabels[role].label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {editRole === 'evidenticar' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <Building2 size={14} className="inline mr-1" />
                          Upravljane organizacijske jedinice
                        </label>
                        <p className="text-xs text-gray-500 mb-3">
                          Odaberite jedinice za koje će evidentičar voditi evidenciju opreme.
                        </p>
                        <div className="max-h-[200px] overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                          {state.orgUnits.map(unit => {
                            const isSelected = editManagedUnits.includes(unit.id);
                            return (
                              <button
                                key={unit.id}
                                onClick={() => toggleManagedUnit(unit.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                                  isSelected ? 'bg-purple-50' : 'hover:bg-gray-50'
                                }`}
                              >
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                  isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-300'
                                }`}>
                                  {isSelected && <Check size={12} className="text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-700 truncate">{unit.name}</p>
                                  <p className="text-xs text-gray-400">{getOrgUnitTypeLabel(unit.type)}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {editManagedUnits.length > 0 && (
                          <p className="text-xs text-purple-600 mt-2">
                            Odabrano: {editManagedUnits.length} jedinica
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditIsActive(true)}
                          className={`flex-1 p-3 rounded-lg border-2 text-center transition-all ${
                            editIsActive 
                              ? 'border-green-500 bg-green-50' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <Check size={16} className="mx-auto mb-1 text-green-600" />
                          <span className="text-xs font-medium">Aktivan</span>
                        </button>
                        <button
                          onClick={() => setEditIsActive(false)}
                          className={`flex-1 p-3 rounded-lg border-2 text-center transition-all ${
                            !editIsActive 
                              ? 'border-red-500 bg-red-50' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <X size={16} className="mx-auto mb-1 text-red-600" />
                          <span className="text-xs font-medium">Neaktivan</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                    <button
                      onClick={() => setEditingUserId(null)}
                      className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Odustani
                    </button>
                    <button
                      onClick={saveUser}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Sačuvaj
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
