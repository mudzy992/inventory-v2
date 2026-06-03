import { useMemo, useState } from 'react';
import { Plus, Edit2, Search, User } from 'lucide-react';
import { useStore, useRefreshData } from '../useStore';
import { getEmployeeFullName } from '../helpers';
import { formatRegistrarAssignmentLabel } from '../helpers/org-warehouse.util';
import { USER_ROLE_META } from './user-management/user-role-config';
import { UserFormModal, type UserFormMode } from './user-management/user-form-modal';
import type { UserAccount } from '../types';

export function UserManagementPage() {
  const [state] = useStore();
  const refresh = useRefreshData();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [formMode, setFormMode] = useState<UserFormMode | null>(null);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

  const employeesWithoutAccount = useMemo(
    () => state.employees.filter((emp) => !state.users.some((user) => user.employeeId === emp.id)),
    [state.employees, state.users],
  );

  const filteredUsers = useMemo(() => {
    return state.users.filter((user) => {
      const emp = state.employees.find((row) => row.id === user.employeeId);
      const label = emp
        ? `${emp.firstName} ${emp.lastName} ${user.username}`
        : user.username;
      const matchSearch = search === '' || label.toLowerCase().includes(search.toLowerCase());
      const matchRole = filterRole === '' || user.role === filterRole;
      return matchSearch && matchRole;
    });
  }, [state.users, state.employees, search, filterRole]);

  const openCreate = () => {
    setEditingUser(null);
    setFormMode('create');
  };

  const openEdit = (user: UserAccount) => {
    setEditingUser(user);
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingUser(null);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Upravljanje korisnicima</h1>
          <p className="text-gray-500 mt-1">Dodjeljivanje uloga i upravljanje pristupom</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={employeesWithoutAccount.length === 0}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={16} /> Novi korisnik
        </button>
      </div>

      {employeesWithoutAccount.length > 0 && (
        <p className="text-xs text-gray-500 mb-4">
          {employeesWithoutAccount.length} radnik(a) bez korisničkog računa
        </p>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex gap-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pretraži korisnike..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={filterRole}
          onChange={(event) => setFilterRole(event.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          <option value="">Sve uloge</option>
          <option value="admin">Administrator</option>
          <option value="evidenticar">Evidentičar</option>
          <option value="user">Korisnik</option>
        </select>
      </div>

      <div className="flex gap-3 mb-4 text-xs flex-wrap">
        <span className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-amber-700">
          Administratori: <strong>{state.users.filter((user) => user.role === 'admin').length}</strong>
        </span>
        <span className="bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg text-purple-700">
          Evidentičari: <strong>{state.users.filter((user) => user.role === 'evidenticar').length}</strong>
        </span>
        <span className="bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg text-gray-700">
          Korisnici: <strong>{state.users.filter((user) => user.role === 'user').length}</strong>
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Korisnik</th>
                <th className="px-4 py-3 font-medium text-gray-600">Korisničko ime</th>
                <th className="px-4 py-3 font-medium text-gray-600">Uloga</th>
                <th className="px-4 py-3 font-medium text-gray-600">Dodjele (Režim A / B)</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const emp = state.employees.find((row) => row.id === user.employeeId);
                const role = USER_ROLE_META[user.role];
                const scopeLabels = user.role === 'evidenticar'
                  ? (user.registrarScopes ?? []).map((scope) => ({
                      id: `${scope.warehouseId}-${scope.categoryId}-${scope.orgUnitId ?? 'a'}`,
                      mode: scope.orgUnitId ? 'B' : 'A',
                      label: formatRegistrarAssignmentLabel(scope, state),
                    }))
                  : [];
                return (
                  <tr key={user.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {emp ? (
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-medium text-gray-600">
                            {emp.firstName[0]}
                            {emp.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{getEmployeeFullName(emp)}</p>
                            <p className="text-xs text-gray-400">{emp.title}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">Bez radnika</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{user.username}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${role.color}`}
                      >
                        {role.icon} {role.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {scopeLabels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {scopeLabels.slice(0, 2).map((scope) => (
                            <span
                              key={scope.id}
                              className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded"
                              title={scope.label}
                            >
                              Režim {scope.mode}: {scope.label}
                            </span>
                          ))}
                          {scopeLabels.length > 2 && (
                            <span className="text-xs text-gray-400">+{scopeLabels.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {user.isActive ? 'Aktivan' : 'Neaktivan'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(user)}
                        className="text-blue-500 hover:text-blue-700 p-1"
                        title="Uredi pristup"
                        aria-label="Uredi pristup"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-12">
                    <User size={24} className="mx-auto mb-2 opacity-40" />
                    Nema rezultata
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formMode && (
        <UserFormModal
          mode={formMode}
          user={editingUser}
          employees={state.employees}
          employeesWithoutAccount={employeesWithoutAccount}
          cities={state.cities}
          categories={state.categories}
          warehouses={state.warehouses}
          orgUnits={state.orgUnits}
          onClose={closeForm}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
