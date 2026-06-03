import { Check, MapPin, Plus, Trash2, Warehouse, X } from 'lucide-react';
import type { Category, OrgUnit, RegistrarScopeAssignment, UserRole, Warehouse as WarehouseType } from '../../types';
import { getCityLabel, getOrgUnitTypeLabel } from '../../helpers';
import { USER_ROLE_META, USER_ROLE_OPTIONS } from './user-role-config';
import { selectClass } from '../ui/form-styles';

interface UserAccessFieldsProps {
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
  registrarScopes: RegistrarScopeAssignment[];
  onRegistrarScopesChange: (scopes: RegistrarScopeAssignment[]) => void;
  warehouses: WarehouseType[];
  categories: Category[];
  orgUnits: OrgUnit[];
  cities: { id: string; name: string; canton?: { name: string } }[];
  isActive: boolean;
  onIsActiveChange: (active: boolean) => void;
}

export const UserAccessFields = ({
  role,
  onRoleChange,
  registrarScopes,
  onRegistrarScopesChange,
  warehouses,
  categories,
  orgUnits,
  cities,
  isActive,
  onIsActiveChange,
}: UserAccessFieldsProps) => {
  const parentCategories = categories.filter((row) => row.parentId === null);
  const activeWarehouses = warehouses.filter((row) => row.isActive !== false);
  const handleAddScope = () => {
    const warehouseId = activeWarehouses[0]?.id ?? '';
    const categoryId = parentCategories[0]?.id ?? '';
    if (!warehouseId || !categoryId) {
      return;
    }
    onRegistrarScopesChange([...registrarScopes, { warehouseId, categoryId, orgUnitId: null }]);
  };
  const handleUpdateScope = (index: number, patch: Partial<RegistrarScopeAssignment>) => {
    onRegistrarScopesChange(
      registrarScopes.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  };
  const handleRemoveScope = (index: number) => {
    onRegistrarScopesChange(registrarScopes.filter((_, rowIndex) => rowIndex !== index));
  };
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Uloga i pristup</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {USER_ROLE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onRoleChange(option)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                role === option ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex justify-center sm:justify-start mb-1">{USER_ROLE_META[option].icon}</div>
              <span className="text-xs font-medium block">{USER_ROLE_META[option].label}</span>
              <span className="text-[10px] text-gray-500 mt-1 block">{USER_ROLE_META[option].description}</span>
            </button>
          ))}
        </div>
      </div>
      {role === 'evidenticar' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <MapPin size={14} className="inline mr-1" />
            Dodjele (skladište + kategorija + opcionalno org)
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Režim A: bez org jedinice — vidi skladište i može zadužiti. Režim B: suženje na podstablo org
            jedinice — bez zaduženja sa skladišta.
          </p>
          <div className="space-y-2">
            {registrarScopes.map((scope, index) => {
              const modeLabel = scope.orgUnitId ? 'B (org)' : 'A (skladište)';
              return (
                <div
                  key={`${scope.warehouseId}-${scope.categoryId}-${scope.orgUnitId ?? 'a'}-${index}`}
                  className="flex flex-col gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50/80"
                >
                  <span className="text-[10px] font-medium text-purple-700 uppercase tracking-wide">
                    Režim {modeLabel}
                  </span>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={scope.warehouseId}
                      onChange={(event) => handleUpdateScope(index, { warehouseId: event.target.value })}
                      className={`${selectClass} flex-1 min-w-[140px]`}
                      aria-label="Skladište"
                    >
                      {activeWarehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name} ({getCityLabel(cities, warehouse.cityId)})
                        </option>
                      ))}
                    </select>
                    <select
                      value={scope.categoryId}
                      onChange={(event) => handleUpdateScope(index, { categoryId: event.target.value })}
                      className={`${selectClass} flex-1 min-w-[140px]`}
                      aria-label="Kategorija"
                    >
                      {parentCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={scope.orgUnitId ?? ''}
                      onChange={(event) =>
                        handleUpdateScope(index, {
                          orgUnitId: event.target.value ? event.target.value : null,
                        })
                      }
                      className={`${selectClass} flex-1 min-w-[160px]`}
                      aria-label="Org jedinica (opcionalno)"
                    >
                      <option value="">— Režim A (cijelo skladište) —</option>
                      {orgUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name} ({getOrgUnitTypeLabel(unit.type)})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveScope(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      aria-label="Ukloni dodjelu"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={handleAddScope}
              disabled={activeWarehouses.length === 0 || parentCategories.length === 0}
              className="flex items-center gap-1 text-sm text-purple-700 hover:text-purple-900 disabled:opacity-50"
            >
              <Plus size={14} />
              <Warehouse size={14} />
              Dodaj dodjelu
            </button>
          </div>
          {registrarScopes.length > 0 && (
            <p className="text-xs text-purple-600 mt-2">Odabrano: {registrarScopes.length} dodjela</p>
          )}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Status računa</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onIsActiveChange(true)}
            className={`flex-1 p-3 rounded-lg border-2 text-center transition-all ${
              isActive ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Check size={16} className="mx-auto mb-1 text-green-600" />
            <span className="text-xs font-medium">Aktivan</span>
          </button>
          <button
            type="button"
            onClick={() => onIsActiveChange(false)}
            className={`flex-1 p-3 rounded-lg border-2 text-center transition-all ${
              !isActive ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <X size={16} className="mx-auto mb-1 text-red-600" />
            <span className="text-xs font-medium">Neaktivan</span>
          </button>
        </div>
      </div>
    </div>
  );
};
