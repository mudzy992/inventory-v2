import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Search } from 'lucide-react';
import { useStore, useRefreshData } from '../useStore';
import { fetchEmployeeApi } from '../api/employees-api';
import { fetchUsersPageApi } from '../api/users-api';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { getEmployeeFullName } from '../helpers';
import { formatRegistrarAssignmentLabel } from '../helpers/org-warehouse.util';
import { USER_ROLE_META } from './user-management/user-role-config';
import { UserFormModal, type UserFormMode } from './user-management/user-form-modal';
import type { UserAccount } from '../types';
import { PageHeaderRow } from './ui/page-header-row';
import { ResponsiveTable } from './ui/responsive-table';
import { PaginationControls } from './ui/pagination-controls';
import type { Employee } from '../types';

export function UserManagementPage() {
  const [state] = useStore();
  const refresh = useRefreshData();
  const [filterRole, setFilterRole] = useState('');
  const [formMode, setFormMode] = useState<UserFormMode | null>(null);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [employeeCache, setEmployeeCache] = useState<Record<string, Employee>>({});

  const list = usePaginatedList<UserAccount, Record<string, never>>({
    fetchPage: fetchUsersPageApi,
  });

  const search = list.search;
  const setSearch = list.setSearch;

  useEffect(() => {
    for (const user of list.items) {
      if (user.employeeId && !employeeCache[user.employeeId]) {
        void fetchEmployeeApi(user.employeeId)
          .then((employee) => {
            setEmployeeCache((prev) => ({ ...prev, [employee.id]: employee }));
          })
          .catch(() => undefined);
      }
    }
  }, [employeeCache, list.items]);

  const filteredUsers = useMemo(() => {
    return list.items.filter((user) => {
      const emp = user.employeeId ? employeeCache[user.employeeId] : undefined;
      const label = emp
        ? `${emp.firstName} ${emp.lastName} ${user.username}`
        : user.username;
      const matchSearch = search === '' || label.toLowerCase().includes(search.toLowerCase());
      const matchRole = filterRole === '' || user.role === filterRole;
      return matchSearch && matchRole;
    });
  }, [employeeCache, filterRole, list.items, search]);

  const roleCounts = useMemo(
    () => ({
      admin: filteredUsers.filter((user) => user.role === 'admin').length,
      evidenticar: filteredUsers.filter((user) => user.role === 'evidenticar').length,
      user: filteredUsers.filter((user) => user.role === 'user').length,
    }),
    [filteredUsers],
  );

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
      <PageHeaderRow
        title="Upravljanje korisnicima"
        description="Dodjeljivanje uloga i upravljanje pristupom"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus size={16} /> Novi korisnik
          </button>
        }
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center">
        <div className="relative flex-1 min-w-0">
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
          Administratori: <strong>{roleCounts.admin}</strong>
        </span>
        <span className="bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg text-purple-700">
          Evidentičari: <strong>{roleCounts.evidenticar}</strong>
        </span>
        <span className="bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg text-gray-700">
          Korisnici: <strong>{roleCounts.user}</strong>
        </span>
      </div>

      <ResponsiveTable
        isEmpty={!list.isLoading && filteredUsers.length === 0}
        emptyMessage={list.isLoading ? 'Učitavanje…' : 'Nema rezultata'}
        mobile={filteredUsers.map((user) => {
          const emp = user.employeeId ? employeeCache[user.employeeId] : undefined;
          const role = USER_ROLE_META[user.role];
          return (
            <div key={user.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-800">{emp ? getEmployeeFullName(emp) : user.username}</p>
                  <p className="text-xs text-gray-500 font-mono">{user.username}</p>
                </div>
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium shrink-0 ${role.color}`}>
                  {role.icon} {role.label}
                </span>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full inline-block ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {user.isActive ? 'Aktivan' : 'Neaktivan'}
              </span>
              <button type="button" onClick={() => openEdit(user)} className="text-blue-500 hover:text-blue-700 p-1" title="Uredi">
                <Edit2 size={14} />
              </button>
            </div>
          );
        })}
        desktop={
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
                const emp = user.employeeId ? employeeCache[user.employeeId] : undefined;
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
            </tbody>
          </table>
        }
      />

      {list.meta ? (
        <PaginationControls
          page={list.page}
          pageSize={list.pageSize}
          total={list.meta.total}
          totalPages={list.meta.totalPages}
          onPageChange={list.setPage}
          onPageSizeChange={list.setPageSize}
          className="rounded-b-xl border border-t-0 border-gray-100"
        />
      ) : null}

      {formMode && (
        <UserFormModal
          mode={formMode}
          user={editingUser}
          employees={Object.values(employeeCache)}
          employeesWithoutAccount={[]}
          cities={state.cities}
          categories={state.categories}
          warehouses={state.warehouses}
          orgUnits={state.orgUnits}
          onClose={closeForm}
          onSaved={async () => {
            await refresh();
            await list.refresh();
          }}
        />
      )}
    </div>
  );
}
