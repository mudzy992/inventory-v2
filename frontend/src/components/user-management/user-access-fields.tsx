import { MapPin, Plus, Warehouse } from 'lucide-react';
import type {
  AppState,
  Category,
  Equipment,
  OrgUnit,
  CoordinatorScopeAssignment,
  ModeratorOrgAssignment,
  ModeratorWarehouseAssignment,
  RegistrarScopeAssignment,
  UserRole,
  Warehouse as WarehouseType,
} from '../../types';
import { formatRegistrarAssignmentLabel } from '../../helpers/org-warehouse.util';
import {
  getWarehouseCategoryIds,
  normalizeScopeAfterWarehouseChange,
  validateRegistrarScopes,
  type RegistrarAssignmentValidationContext,
} from '../../helpers/registrar-assignment-rules';
import { USER_ROLE_META, USER_ROLE_OPTIONS } from './user-role-config';
import { RegistrarScopeRow } from './registrar-scope-row';
import { Check, X } from 'lucide-react';
import { getOrgUnitPath, getOrgUnitTypeLabel } from '../../helpers';
import {
  findModeratorOrgAssignmentRedundancy,
  isOrgUnitCoveredByModeratorAssignments,
  MODERATOR_ASSIGNABLE_ORG_TYPES,
} from '../../helpers/moderator-org-scope.util';

interface UserAccessFieldsProps {
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
  roleOptions?: UserRole[];
  registrarScopes: RegistrarScopeAssignment[];
  onRegistrarScopesChange: (scopes: RegistrarScopeAssignment[]) => void;
  coordinatorAssignments: CoordinatorScopeAssignment[];
  onCoordinatorAssignmentsChange: (scopes: CoordinatorScopeAssignment[]) => void;
  moderatorOrgAssignments: ModeratorOrgAssignment[];
  onModeratorOrgAssignmentsChange: (scopes: ModeratorOrgAssignment[]) => void;
  moderatorWarehouseAssignments: ModeratorWarehouseAssignment[];
  onModeratorWarehouseAssignmentsChange: (scopes: ModeratorWarehouseAssignment[]) => void;
  canEditModeratorAssignments?: boolean;
  warehouses: WarehouseType[];
  categories: Category[];
  orgUnits: OrgUnit[];
  equipment: Pick<Equipment, 'warehouseId' | 'categoryId'>[];
  cities: { id: string; name: string; canton?: { name: string } }[];
  isActive: boolean;
  onIsActiveChange: (active: boolean) => void;
  scopeValidationErrors?: string[];
}

export const UserAccessFields = ({
  role,
  onRoleChange,
  roleOptions = USER_ROLE_OPTIONS,
  registrarScopes,
  onRegistrarScopesChange,
  coordinatorAssignments,
  onCoordinatorAssignmentsChange,
  moderatorOrgAssignments,
  onModeratorOrgAssignmentsChange,
  moderatorWarehouseAssignments,
  onModeratorWarehouseAssignmentsChange,
  canEditModeratorAssignments = false,
  warehouses,
  categories,
  orgUnits,
  equipment,
  cities,
  isActive,
  onIsActiveChange,
  scopeValidationErrors = [],
}: UserAccessFieldsProps) => {
  const ctx: RegistrarAssignmentValidationContext = {
    categories,
    warehouses,
    orgUnits,
    equipment,
  };
  const activeWarehouses = warehouses.filter((row) => row.isActive !== false);
  const parentCategories = categories.filter((row) => row.parentId === null);
  const moderatorOrgAssignmentIds = moderatorOrgAssignments.map((row) => row.orgUnitId);
  const moderatorOrgAssignableOptions = orgUnits.filter((row) =>
    MODERATOR_ASSIGNABLE_ORG_TYPES.includes(row.type as (typeof MODERATOR_ASSIGNABLE_ORG_TYPES)[number]),
  );
  const getModeratorOrgOptionsForRow = (currentOrgUnitId: string) =>
    moderatorOrgAssignableOptions.filter((unit) => {
      if (unit.id === currentOrgUnitId) {
        return true;
      }
      const otherAssignments = moderatorOrgAssignmentIds.filter((id) => id !== currentOrgUnitId);
      if (otherAssignments.includes(unit.id)) {
        return false;
      }
      return !isOrgUnitCoveredByModeratorAssignments(unit.id, otherAssignments, orgUnits);
    });
  const formatModeratorOrgOptionLabel = (unit: OrgUnit): string => {
    const path = getOrgUnitPath(orgUnits, unit.id);
    return `${path} (${getOrgUnitTypeLabel(unit.type)})`;
  };
  const isWarehouseInModeratorOrgScope = (warehouse: WarehouseType): boolean => {
    if (!warehouse.orgUnitId || moderatorOrgAssignments.length === 0) {
      return false;
    }
    let currentId: string | null = warehouse.orgUnitId;
    while (currentId) {
      if (moderatorOrgAssignments.some((row) => row.orgUnitId === currentId)) {
        return true;
      }
      currentId = orgUnits.find((unit) => unit.id === currentId)?.parentId ?? null;
    }
    return false;
  };
  const scopedModeratorWarehouses = activeWarehouses.filter(isWarehouseInModeratorOrgScope);

  const handleAddScope = () => {
    const warehouseId = activeWarehouses[0]?.id ?? '';
    const categoryIds = warehouseId ? getWarehouseCategoryIds(warehouseId, ctx) : [];
    const categoryId = categoryIds[0] ?? parentCategories[0]?.id ?? '';
    if (!warehouseId || !categoryId) {
      return;
    }
    onRegistrarScopesChange([...registrarScopes, { warehouseId, categoryId, orgUnitId: null }]);
  };

  const handleUpdateScope = (index: number, patch: Partial<RegistrarScopeAssignment>) => {
    onRegistrarScopesChange(
      registrarScopes.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }
        let next = { ...row, ...patch };
        if (patch.warehouseId !== undefined) {
          next = normalizeScopeAfterWarehouseChange(next, ctx);
        }
        if (patch.categoryId !== undefined && !patch.orgUnitId) {
          const mode = validateRegistrarScopes(
            registrarScopes.map((scope, scopeIndex) =>
              scopeIndex === index ? next : scope,
            ),
            ctx,
          );
          if (!mode.valid && next.orgUnitId) {
            next = { ...next, orgUnitId: null };
          }
        }
        return next;
      }),
    );
  };

  const handleRemoveScope = (index: number) => {
    onRegistrarScopesChange(registrarScopes.filter((_, rowIndex) => rowIndex !== index));
  };

  const inlineValidation = validateRegistrarScopes(registrarScopes, ctx);
  const displayErrors = scopeValidationErrors.length > 0 ? scopeValidationErrors : inlineValidation.errors;

  const summaryState = {
    warehouses,
    categories,
    orgUnits,
    cities,
    employees: [],
    equipment: [],
    transfers: [],
    users: [],
    notifications: [],
    savedFilters: [],
    cantons: [],
    currentUserId: null,
  } as AppState;

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Uloga i pristup</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {roleOptions.map((option) => (
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
            Dodjele evidentičara
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Režim A: skladište + kategorija (puna evidencija). Režim B: ista kombinacija + služba (samo
            zadužena oprema i razduženje). Za isto skladište i kategoriju dozvoljen je samo jedan režim.
          </p>
          <div className="space-y-2">
            {registrarScopes.map((scope, index) => (
              <RegistrarScopeRow
                key={`${scope.warehouseId}-${scope.categoryId}-${scope.orgUnitId ?? 'a'}-${index}`}
                scope={scope}
                index={index}
                scopes={registrarScopes}
                warehouses={warehouses}
                categories={categories}
                orgUnits={orgUnits}
                equipment={equipment}
                cities={cities}
                onChange={(patch) => handleUpdateScope(index, patch)}
                onRemove={() => handleRemoveScope(index)}
              />
            ))}
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
          {displayErrors.length > 0 && (
            <ul className="mt-2 space-y-1">
              {displayErrors.map((message) => (
                <li
                  key={message}
                  className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5"
                >
                  {message}
                </li>
              ))}
            </ul>
          )}
          {registrarScopes.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium text-purple-700">Sažetak ({registrarScopes.length})</p>
              <ul className="text-xs text-gray-600 space-y-0.5">
                {registrarScopes.map((scope, index) => (
                  <li key={`summary-${index}`}>
                    {formatRegistrarAssignmentLabel(scope, summaryState)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {role === 'popis_koordinator' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Warehouse size={14} className="inline mr-1" />
            Dodjele koordinatora (skladišta)
          </label>
          <div className="space-y-2">
            {coordinatorAssignments.map((scope, index) => (
              <div key={`coord-${scope.warehouseId}-${index}`} className="flex flex-wrap gap-2 items-center">
                <select
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  value={scope.warehouseId}
                  onChange={(event) =>
                    onCoordinatorAssignmentsChange(
                      coordinatorAssignments.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, warehouseId: event.target.value } : row,
                      ),
                    )
                  }
                >
                  {activeWarehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
                <select
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  value={scope.orgUnitId ?? ''}
                  onChange={(event) =>
                    onCoordinatorAssignmentsChange(
                      coordinatorAssignments.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, orgUnitId: event.target.value || null }
                          : row,
                      ),
                    )
                  }
                >
                  <option value="">Sva distribucija (skladište)</option>
                  {orgUnits
                    .filter((unit) => unit.type === 'distribucija')
                    .map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={() =>
                    onCoordinatorAssignmentsChange(
                      coordinatorAssignments.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                >
                  Ukloni
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const warehouseId = activeWarehouses[0]?.id ?? '';
                if (!warehouseId) {
                  return;
                }
                onCoordinatorAssignmentsChange([
                  ...coordinatorAssignments,
                  { warehouseId, orgUnitId: null },
                ]);
              }}
              disabled={activeWarehouses.length === 0}
              className="flex items-center gap-1 text-sm text-indigo-700 hover:text-indigo-900 disabled:opacity-50"
            >
              <Plus size={14} />
              Dodaj skladište
            </button>
          </div>
        </div>
      )}
      {role === 'moderator' && canEditModeratorAssignments && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <MapPin size={14} className="inline mr-1" />
              Org opseg (moderacija)
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Odaberite org jedinicu na bilo kom nivou hijerarhije. Moderator upravlja cijelim podstablom ispod
              odabira.
            </p>
            <div className="space-y-2">
              {moderatorOrgAssignments.map((scope, index) => {
                const rowOptions = getModeratorOrgOptionsForRow(scope.orgUnitId);
                const redundancy =
                  findModeratorOrgAssignmentRedundancy(
                    scope.orgUnitId,
                    moderatorOrgAssignmentIds.filter((id) => id !== scope.orgUnitId),
                    orgUnits,
                  ) ?? null;
                return (
                  <div key={`mod-org-${scope.orgUnitId}-${index}`} className="space-y-1">
                    <div className="flex flex-wrap gap-2 items-center">
                      <select
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm min-w-[280px]"
                        value={scope.orgUnitId}
                        onChange={(event) => {
                          const nextOrgUnitId = event.target.value;
                          const warning = findModeratorOrgAssignmentRedundancy(
                            nextOrgUnitId,
                            moderatorOrgAssignmentIds.filter((id) => id !== scope.orgUnitId),
                            orgUnits,
                          );
                          if (warning) {
                            return;
                          }
                          onModeratorOrgAssignmentsChange(
                            moderatorOrgAssignments.map((row, rowIndex) =>
                              rowIndex === index ? { orgUnitId: nextOrgUnitId } : row,
                            ),
                          );
                        }}
                      >
                        {rowOptions.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {formatModeratorOrgOptionLabel(unit)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() =>
                          onModeratorOrgAssignmentsChange(
                            moderatorOrgAssignments.filter((_, rowIndex) => rowIndex !== index),
                          )
                        }
                      >
                        Ukloni
                      </button>
                    </div>
                    {redundancy ? (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
                        {redundancy}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  const available = getModeratorOrgOptionsForRow('');
                  const orgUnitId = available[0]?.id ?? '';
                  if (!orgUnitId) {
                    return;
                  }
                  onModeratorOrgAssignmentsChange([...moderatorOrgAssignments, { orgUnitId }]);
                }}
                disabled={getModeratorOrgOptionsForRow('').length === 0}
                className="flex items-center gap-1 text-sm text-orange-700 hover:text-orange-900 disabled:opacity-50"
              >
                <Plus size={14} />
                Dodaj org jedinicu
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Warehouse size={14} className="inline mr-1" />
              Skladišta za popisne komisije
            </label>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 mb-3">
              Jedno skladište može imati samo jednog moderatora (1:1 dodjela).
            </p>
            <div className="space-y-2">
              {moderatorWarehouseAssignments.map((scope, index) => (
                <div key={`mod-wh-${scope.warehouseId}-${index}`} className="flex flex-wrap gap-2 items-center">
                  <select
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm min-w-[220px]"
                    value={scope.warehouseId}
                    onChange={(event) =>
                      onModeratorWarehouseAssignmentsChange(
                        moderatorWarehouseAssignments.map((row, rowIndex) =>
                          rowIndex === index ? { warehouseId: event.target.value } : row,
                        ),
                      )
                    }
                  >
                    {scopedModeratorWarehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() =>
                      onModeratorWarehouseAssignmentsChange(
                        moderatorWarehouseAssignments.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    Ukloni
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const warehouseId = scopedModeratorWarehouses[0]?.id ?? '';
                  if (!warehouseId) {
                    return;
                  }
                  onModeratorWarehouseAssignmentsChange([
                    ...moderatorWarehouseAssignments,
                    { warehouseId },
                  ]);
                }}
                disabled={scopedModeratorWarehouses.length === 0 || moderatorOrgAssignments.length === 0}
                className="flex items-center gap-1 text-sm text-orange-700 hover:text-orange-900 disabled:opacity-50"
              >
                <Plus size={14} />
                Dodaj skladište
              </button>
            </div>
          </div>
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
