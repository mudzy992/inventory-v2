import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  createUserApi,
  updateUserApi,
  type CreateUserPayload,
  type UpdateUserPayload,
} from '../../api/data-api';
import { getEmployeeFullName, getOrgUnitPath } from '../../helpers';
import { SearchableAutocomplete, type SearchableOption } from '../searchable-autocomplete';
import type {
  Category,
  City,
  Employee,
  OrgUnit,
  RegistrarScopeAssignment,
  UserAccount,
  UserRole,
  Warehouse,
} from '../../types';
import { UserAccessFields } from './user-access-fields';

export type UserFormMode = 'create' | 'edit';

interface UserFormModalProps {
  mode: UserFormMode;
  user: UserAccount | null;
  employees: Employee[];
  employeesWithoutAccount: Employee[];
  cities: City[];
  categories: Category[];
  warehouses: Warehouse[];
  orgUnits: OrgUnit[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const suggestUsername = (employee: Employee): string => {
  const fromEmail = employee.email?.split('@')[0]?.trim();
  if (fromEmail) {
    return fromEmail.toLowerCase();
  }
  const normalized = `${employee.firstName}.${employee.lastName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]/g, '');
  return normalized;
};

export const UserFormModal = ({
  mode,
  user,
  employees,
  employeesWithoutAccount,
  cities,
  categories,
  warehouses,
  orgUnits,
  onClose,
  onSaved,
}: UserFormModalProps) => {
  const [employeeId, setEmployeeId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [registrarScopes, setRegistrarScopes] = useState<RegistrarScopeAssignment[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const employeeOptions = useMemo(() => {
    if (mode === 'create') {
      return employeesWithoutAccount;
    }
    if (!user?.employeeId) {
      return employees;
    }
    const linked = employees.find((row) => row.id === user.employeeId);
    return linked ? [linked] : employees;
  }, [mode, employees, employeesWithoutAccount, user]);

  const searchableEmployeeOptions = useMemo((): SearchableOption[] => {
    return employeeOptions.map((employee) => {
      const orgUnit = orgUnits.find((unit) => unit.id === employee.orgUnitId);
      const orgPath = orgUnit ? getOrgUnitPath(orgUnits, orgUnit.id) : '—';
      return {
        id: employee.id,
        label: getEmployeeFullName(employee),
        subLabel: `${employee.title || '—'} · ${orgPath}`,
        searchText: `${employee.email ?? ''} ${orgPath}`,
      };
    });
  }, [employeeOptions, orgUnits]);

  useEffect(() => {
    if (mode === 'edit' && user) {
      setEmployeeId(user.employeeId);
      setUsername(user.username);
      setPassword('');
      setRole(user.role);
      setRegistrarScopes(user.registrarScopes ?? []);
      setIsActive(user.isActive);
      return;
    }
    const first = employeesWithoutAccount[0];
    setEmployeeId(first?.id ?? '');
    setUsername(first ? suggestUsername(first) : '');
    setPassword('');
    setRole('user');
    setRegistrarScopes([]);
    setIsActive(true);
  }, [mode, user, employeesWithoutAccount]);

  const handleEmployeeChange = (nextEmployeeId: string) => {
    setEmployeeId(nextEmployeeId);
    if (mode !== 'create') {
      return;
    }
    const employee = employeesWithoutAccount.find((row) => row.id === nextEmployeeId);
    if (employee) {
      setUsername(suggestUsername(employee));
    }
  };

  const handleRoleChange = (nextRole: UserRole) => {
    setRole(nextRole);
    if (nextRole !== 'evidenticar') {
      setRegistrarScopes([]);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!employeeId) {
      setError('Odaberite radnika');
      return;
    }
    if (mode === 'create' && (!username.trim() || password.length < 6)) {
      setError('Korisničko ime i lozinka (min. 6 znakova) su obavezni');
      return;
    }
    if (role === 'evidenticar' && registrarScopes.length === 0) {
      setError('Evidentičar mora imati barem jednu dodjelu (skladište + kategorija).');
      return;
    }
    setIsSaving(true);
    try {
      if (mode === 'create') {
        const createPayload: CreateUserPayload = {
          username: username.trim(),
          password,
          role,
          employeeId,
          isActive,
          registrarScopes: role === 'evidenticar' ? registrarScopes : [],
        };
        await createUserApi(createPayload);
      } else if (user) {
        const updatePayload: UpdateUserPayload = {
          role,
          employeeId,
          isActive,
          registrarScopes: role === 'evidenticar' ? registrarScopes : [],
        };
        if (password.length >= 6) {
          updatePayload.password = password;
        }
        await updateUserApi(user.id, updatePayload);
      }
      await onSaved();
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri spremanju';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedEmployee = employees.find((row) => row.id === employeeId);
  const title = mode === 'create' ? 'Novi korisnik' : 'Uredi korisnika';

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="user-form-title"
      >
        <div className="p-6 border-b border-gray-100">
          <h2 id="user-form-title" className="text-lg font-semibold">
            {title}
          </h2>
          {selectedEmployee && (
            <p className="text-sm text-gray-500">{getEmployeeFullName(selectedEmployee)}</p>
          )}
        </div>
        <div className="p-6 space-y-4">
          {mode === 'create' && employeesWithoutAccount.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Svi radnici već imaju korisnički račun. Dodajte novog radnika u modulu Radnici.
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="user-employee" className="block text-sm font-medium text-gray-700 mb-1">
                  Radnik
                </label>
                <SearchableAutocomplete
                  id="user-employee"
                  options={searchableEmployeeOptions}
                  value={employeeId}
                  onChange={handleEmployeeChange}
                  emptyOption={{ id: '', label: '— Odaberite —' }}
                  placeholder="Pretraži radnika…"
                  ariaLabel="Radnik"
                  required={mode === 'create'}
                  disabled={mode === 'edit'}
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Prikaz: ime · pozicija · org. putanja. Pri kucanju: pretraga po imenu, poziciji ili emailu.
                </p>
              </div>
              <div>
                <label htmlFor="user-username" className="block text-sm font-medium text-gray-700 mb-1">
                  Korisničko ime
                </label>
                <input
                  id="user-username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={mode === 'edit'}
                  autoComplete="username"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50"
                />
              </div>
              <div>
                <label htmlFor="user-password" className="block text-sm font-medium text-gray-700 mb-1">
                  {mode === 'create' ? 'Lozinka' : 'Nova lozinka (opcionalno)'}
                </label>
                <input
                  id="user-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === 'create' ? 'new-password' : 'off'}
                  placeholder={mode === 'edit' ? 'Ostavite prazno da zadržite' : ''}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <UserAccessFields
                role={role}
                onRoleChange={handleRoleChange}
                registrarScopes={registrarScopes}
                onRegistrarScopesChange={setRegistrarScopes}
                warehouses={warehouses}
                categories={categories}
                orgUnits={orgUnits}
                cities={cities}
                isActive={isActive}
                onIsActiveChange={setIsActive}
              />
            </>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Odustani
          </button>
          {(mode === 'edit' || employeesWithoutAccount.length > 0) && (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSaving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Spremanje...' : 'Sačuvaj'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
