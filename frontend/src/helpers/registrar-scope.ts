import { getEffectiveCityForOrgUnit, getOrgUnitChildren } from '../helpers';
import type {
  AppState,
  Category,
  Employee,
  Equipment,
  OrgUnit,
  RegistrarScopeAssignment,
  TransferType,
  UserAccount,
  UserRole,
} from '../types';
import {
  collectOrgUnitIdsForEffectiveWarehouse,
  toOrgUnitRows,
  toWarehouseRows,
} from './effective-warehouse.util';

const CATEGORY_READ_ALL_ROLES = new Set<UserRole>(['admin', 'moderator']);

const expandCategoryIds = (categoryIds: string[], categories: AppState['categories']): Set<string> => {
  const result = new Set<string>();
  const childrenByParent = new Map<string | null, string[]>();
  for (const category of categories) {
    const siblings = childrenByParent.get(category.parentId) ?? [];
    siblings.push(category.id);
    childrenByParent.set(category.parentId, siblings);
  }
  const visit = (categoryId: string): void => {
    if (result.has(categoryId)) {
      return;
    }
    result.add(categoryId);
    for (const childId of childrenByParent.get(categoryId) ?? []) {
      visit(childId);
    }
  };
  for (const categoryId of categoryIds) {
    visit(categoryId);
  }
  return result;
};

const expandOrgSubtree = (orgUnits: OrgUnit[], rootId: string): Set<string> => {
  const result = new Set<string>();
  const visit = (id: string): void => {
    if (result.has(id)) {
      return;
    }
    result.add(id);
    for (const child of getOrgUnitChildren(orgUnits, id)) {
      visit(child.id);
    }
  };
  visit(rootId);
  return result;
};

const isModeA = (assignment: RegistrarScopeAssignment): boolean => !assignment.orgUnitId;

const getOrgUnitIdsForWarehouse = (state: AppState, warehouseId: string): Set<string> =>
  collectOrgUnitIdsForEffectiveWarehouse(
    warehouseId,
    toOrgUnitRows(state.orgUnits),
    toWarehouseRows(state.warehouses),
    state.orgUnits,
  );

const getEffectiveOrgIdsForModeB = (
  state: AppState,
  assignment: RegistrarScopeAssignment,
): Set<string> => {
  const warehouseOrgIds = getOrgUnitIdsForWarehouse(state, assignment.warehouseId);
  const assignmentSubtree = expandOrgSubtree(state.orgUnits, assignment.orgUnitId!);
  const result = new Set<string>();
  for (const id of warehouseOrgIds) {
    if (assignmentSubtree.has(id)) {
      result.add(id);
    }
  }
  return result;
};

const isOrgUnitInEffectiveWarehouseScope = (
  state: AppState,
  warehouseId: string,
  orgUnitId: string,
): boolean => getOrgUnitIdsForWarehouse(state, warehouseId).has(orgUnitId);

const matchesAssignmentEquipment = (
  assignment: RegistrarScopeAssignment,
  equipment: Equipment,
  holder: Employee | undefined,
  state: AppState,
): boolean => {
  const expanded = expandCategoryIds([assignment.categoryId], state.categories);
  if (!expanded.has(equipment.categoryId)) {
    return false;
  }
  if (isModeA(assignment)) {
    if (equipment.status === 'skladiste') {
      return equipment.warehouseId === assignment.warehouseId;
    }
    if (equipment.status === 'zaduzeno' && holder) {
      return isOrgUnitInEffectiveWarehouseScope(state, assignment.warehouseId, holder.orgUnitId);
    }
    if (equipment.status === 'rashodovano' || equipment.status === 'za_rashod') {
      return equipment.warehouseId === assignment.warehouseId;
    }
    return false;
  }
  if (equipment.status !== 'zaduzeno' || !holder) {
    return false;
  }
  return getEffectiveOrgIdsForModeB(state, assignment).has(holder.orgUnitId);
};

const matchesAssignmentEmployee = (
  assignment: RegistrarScopeAssignment,
  employee: Employee,
  state: AppState,
): boolean => {
  if (isModeA(assignment)) {
    return isOrgUnitInEffectiveWarehouseScope(state, assignment.warehouseId, employee.orgUnitId);
  }
  return getEffectiveOrgIdsForModeB(state, assignment).has(employee.orgUnitId);
};

const resolveEquipmentHolder = (
  equipment: Equipment,
  state: AppState,
): Pick<Employee, 'id' | 'orgUnitId'> | undefined => {
  if (equipment.currentHolder) {
    return equipment.currentHolder;
  }
  if (equipment.currentHolderId) {
    return state.employees.find((row) => row.id === equipment.currentHolderId);
  }
  return undefined;
};

export const getScopedCategoryIds = (
  user: UserAccount | null,
  categories: Category[],
): Set<string> => {
  if (!user || CATEGORY_READ_ALL_ROLES.has(user.role)) {
    return new Set(categories.map((row) => row.id));
  }
  if (user.role !== 'evidenticar') {
    return new Set();
  }
  const roots = (user.registrarScopes ?? []).map((row) => row.categoryId);
  return expandCategoryIds(roots, categories);
};

export const getScopedParentCategories = (
  user: UserAccount | null,
  categories: Category[],
): Category[] => {
  if (!user || CATEGORY_READ_ALL_ROLES.has(user.role)) {
    return categories.filter((row) => row.parentId === null);
  }
  const scoped = getScopedCategoryIds(user, categories);
  return categories.filter((row) => {
    if (row.parentId !== null) {
      return false;
    }
    if (scoped.has(row.id)) {
      return true;
    }
    return categories.some((child) => child.parentId === row.id && scoped.has(child.id));
  });
};

export const getScopedSubCategories = (
  user: UserAccount | null,
  categories: Category[],
  parentId: string,
): Category[] => {
  const scoped = getScopedCategoryIds(user, categories);
  return categories.filter((row) => row.parentId === parentId && scoped.has(row.id));
};

export const resolveEquipmentCityId = (state: AppState, equipment: Equipment): string | null => {
  const holder = resolveEquipmentHolder(equipment, state);
  if (holder) {
    return getEffectiveCityForOrgUnit(state.orgUnits, holder.orgUnitId);
  }
  if (equipment.warehouseId) {
    const warehouse = state.warehouses.find((row) => row.id === equipment.warehouseId);
    return warehouse?.cityId ?? null;
  }
  return null;
};

export const getMatchingAssignmentsForEquipment = (
  equipment: Equipment,
  user: UserAccount | null,
  state: AppState,
): RegistrarScopeAssignment[] => {
  if (!user || user.role !== 'evidenticar') {
    return [];
  }
  const assignments = user.registrarScopes ?? [];
  const holder = resolveEquipmentHolder(equipment, state);
  return assignments.filter((assignment) =>
    matchesAssignmentEquipment(assignment, equipment, holder as Employee | undefined, state),
  );
};

export const canRegistrarCreateTransfer = (
  equipment: Equipment,
  user: UserAccount | null,
  state: AppState,
  transferType: TransferType,
): boolean => {
  if (!user || user.role === 'admin') {
    return true;
  }
  if (user.role !== 'evidenticar') {
    return false;
  }
  const matches = getMatchingAssignmentsForEquipment(equipment, user, state);
  if (matches.length === 0) {
    return false;
  }
  const hasModeA = matches.some((row) => isModeA(row));
  if (!hasModeA) {
    return transferType === 'razduzenje';
  }
  if (transferType === 'zaduzenje') {
    return matches.some((row) => isModeA(row));
  }
  return true;
};

export const equipmentMatchesScope = (
  equipment: Equipment,
  state: AppState,
  user: UserAccount | null,
): boolean => {
  if (!user || user.role === 'admin') {
    return true;
  }
  if (user.role !== 'evidenticar') {
    return false;
  }
  const assignments = user.registrarScopes ?? [];
  if (assignments.length === 0) {
    return false;
  }
  const holder = resolveEquipmentHolder(equipment, state);
  return assignments.some((assignment) =>
    matchesAssignmentEquipment(assignment, equipment, holder as Employee | undefined, state),
  );
};

export const employeeMatchesScope = (
  employee: Employee,
  state: AppState,
  user: UserAccount | null,
): boolean => {
  if (!user || user.role === 'admin') {
    return true;
  }
  if (user.role !== 'evidenticar') {
    return false;
  }
  const assignments = user.registrarScopes ?? [];
  return assignments.some((assignment) => matchesAssignmentEmployee(assignment, employee, state));
};

export const isEmployeeInManagedUnits = (
  employee: Pick<Employee, 'id' | 'orgUnitId'>,
  state: AppState,
  user: UserAccount | null,
): boolean => employeeMatchesScope(employee as Employee, state, user);

export const transferMatchesScope = (
  equipment: Equipment | undefined,
  state: AppState,
  user: UserAccount | null,
): boolean => {
  if (!user || user.role === 'admin') {
    return true;
  }
  if (user.role !== 'evidenticar' || !equipment) {
    return false;
  }
  return equipmentMatchesScope(equipment, state, user);
};

export const isCrossRegistrarScopeTransfer = (
  state: AppState,
  user: UserAccount | null,
  toEmployee: Pick<Employee, 'id' | 'orgUnitId'> | undefined,
  equipment: Equipment,
): boolean => {
  if (!user || user.role === 'admin' || user.role !== 'evidenticar') {
    return false;
  }
  if (!toEmployee) {
    return true;
  }
  if (!equipmentMatchesScope(equipment, state, user)) {
    return true;
  }
  return !employeeMatchesScope(toEmployee as Employee, state, user);
};
