import { getEffectiveCityForOrgUnit, getOrgUnitChildren } from '../helpers';
import type { AppState, Employee, Equipment, OrgUnit, RegistrarScopeAssignment, UserAccount } from '../types';

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

const isEmployeeInWarehouseCoverage = (
  state: AppState,
  warehouseId: string,
  employeeOrgUnitId: string,
): boolean => {
  const warehouse = state.warehouses.find((row) => row.id === warehouseId);
  if (!warehouse?.orgUnitId) {
    return true;
  }
  const subtree = expandOrgSubtree(state.orgUnits, warehouse.orgUnitId);
  return subtree.has(employeeOrgUnitId);
};

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
      return isEmployeeInWarehouseCoverage(state, assignment.warehouseId, holder.orgUnitId);
    }
    if (equipment.status === 'rashodovano') {
      return equipment.warehouseId === assignment.warehouseId;
    }
    return false;
  }
  if (equipment.status === 'skladiste' || !holder) {
    return false;
  }
  const subtree = expandOrgSubtree(state.orgUnits, assignment.orgUnitId!);
  return subtree.has(holder.orgUnitId);
};

const matchesAssignmentEmployee = (
  assignment: RegistrarScopeAssignment,
  employee: Employee,
  state: AppState,
): boolean => {
  const warehouse = state.warehouses.find((row) => row.id === assignment.warehouseId);
  if (!warehouse) {
    return false;
  }
  const employeeCityId = getEffectiveCityForOrgUnit(state.orgUnits, employee.orgUnitId);
  if (employeeCityId !== warehouse.cityId) {
    return false;
  }
  if (isModeA(assignment)) {
    return isEmployeeInWarehouseCoverage(state, assignment.warehouseId, employee.orgUnitId);
  }
  const subtree = expandOrgSubtree(state.orgUnits, assignment.orgUnitId!);
  return subtree.has(employee.orgUnitId);
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
