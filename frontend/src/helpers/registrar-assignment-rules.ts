import { getEffectiveCityForOrgUnit } from '../helpers';
import type { Category, Equipment, OrgUnit, RegistrarScopeAssignment, Warehouse } from '../types';
import { resolveEffectiveWarehouseForOrgUnit } from './org-warehouse.util';

export type WarehouseCategoryMode = 'A' | 'B';

export interface RegistrarAssignmentValidationContext {
  categories: Category[];
  warehouses: Warehouse[];
  orgUnits: OrgUnit[];
  equipment: Pick<Equipment, 'warehouseId' | 'categoryId'>[];
}

export interface RegistrarAssignmentValidationResult {
  valid: boolean;
  errors: string[];
}

const scopePairKey = (warehouseId: string, categoryId: string): string =>
  `${warehouseId}:${categoryId}`;

const rowKey = (scope: RegistrarScopeAssignment): string =>
  `${scope.warehouseId}:${scope.categoryId}:${scope.orgUnitId ?? '__A__'}`;

export const isRegistrarModeA = (assignment: RegistrarScopeAssignment): boolean =>
  !assignment.orgUnitId;

export const resolveRootCategoryId = (
  categoryId: string,
  categories: Pick<Category, 'id' | 'parentId'>[],
): string => {
  const byId = new Map(categories.map((row) => [row.id, row]));
  let currentId: string | null = categoryId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const row = byId.get(currentId);
    if (!row) {
      return categoryId;
    }
    if (row.parentId === null) {
      return row.id;
    }
    currentId = row.parentId;
  }
  return categoryId;
};

const getAssetParentCategories = (categories: Category[]): Category[] =>
  categories.filter((row) => row.parentId === null && (row.categoryKind ?? 'ASSET') === 'ASSET');

export const getRootCategoryIdsForWarehouse = (
  warehouseId: string,
  ctx: RegistrarAssignmentValidationContext,
): Set<string> => {
  const roots = new Set<string>();
  for (const item of ctx.equipment) {
    if (item.warehouseId !== warehouseId) {
      continue;
    }
    roots.add(resolveRootCategoryId(item.categoryId, ctx.categories));
  }
  return roots;
};

export const getWarehouseCategoryIds = (
  warehouseId: string,
  ctx: RegistrarAssignmentValidationContext,
): string[] => {
  const fromData = getRootCategoryIdsForWarehouse(warehouseId, ctx);
  if (fromData.size > 0) {
    return [...fromData];
  }
  return getAssetParentCategories(ctx.categories).map((row) => row.id);
};

export const getWarehouseCategoryMode = (
  scopes: RegistrarScopeAssignment[],
  warehouseId: string,
  categoryId: string,
  excludeIndex?: number,
): WarehouseCategoryMode | null => {
  const rootId = categoryId;
  for (let index = 0; index < scopes.length; index += 1) {
    if (excludeIndex !== undefined && index === excludeIndex) {
      continue;
    }
    const row = scopes[index]!;
    if (row.warehouseId !== warehouseId || row.categoryId !== rootId) {
      continue;
    }
    return isRegistrarModeA(row) ? 'A' : 'B';
  }
  return null;
};

const resolveOrgEffectiveWarehouseId = (
  orgUnitId: string,
  ctx: RegistrarAssignmentValidationContext,
): string | null =>
  resolveEffectiveWarehouseForOrgUnit(
    ctx.orgUnits,
    ctx.warehouses,
    orgUnitId,
    getEffectiveCityForOrgUnit(ctx.orgUnits, orgUnitId),
  );

const getWarehouseName = (ctx: RegistrarAssignmentValidationContext, warehouseId: string): string =>
  ctx.warehouses.find((row) => row.id === warehouseId)?.name ?? 'Skladište';

const getCategoryName = (ctx: RegistrarAssignmentValidationContext, categoryId: string): string =>
  ctx.categories.find((row) => row.id === categoryId)?.name ?? 'Kategorija';

const getOrgName = (ctx: RegistrarAssignmentValidationContext, orgUnitId: string): string =>
  ctx.orgUnits.find((row) => row.id === orgUnitId)?.name ?? 'Org. jedinica';

export const validateRegistrarScopes = (
  scopes: RegistrarScopeAssignment[],
  ctx: RegistrarAssignmentValidationContext,
): RegistrarAssignmentValidationResult => {
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  for (const scope of scopes) {
    const key = rowKey(scope);
    if (seenKeys.has(key)) {
      errors.push('Duplikat dodjele (isto skladište, kategorija i org. jedinica).');
      continue;
    }
    seenKeys.add(key);
    const allowedCategories = getWarehouseCategoryIds(scope.warehouseId, ctx);
    if (!allowedCategories.includes(scope.categoryId)) {
      errors.push(
        `Kategorija „${getCategoryName(ctx, scope.categoryId)}“ nije dostupna za skladište „${getWarehouseName(ctx, scope.warehouseId)}“.`,
      );
    }
    if (scope.orgUnitId) {
      const effectiveWarehouseId = resolveOrgEffectiveWarehouseId(scope.orgUnitId, ctx);
      if (effectiveWarehouseId !== scope.warehouseId) {
        const effectiveName = effectiveWarehouseId
          ? getWarehouseName(ctx, effectiveWarehouseId)
          : 'nepoznato';
        errors.push(
          `Org. jedinica „${getOrgName(ctx, scope.orgUnitId)}“ pripada skladištu „${effectiveName}“, a ne „${getWarehouseName(ctx, scope.warehouseId)}“.`,
        );
      }
    }
  }
  const pairGroups = new Map<string, RegistrarScopeAssignment[]>();
  for (const scope of scopes) {
    const key = scopePairKey(scope.warehouseId, scope.categoryId);
    const group = pairGroups.get(key) ?? [];
    group.push(scope);
    pairGroups.set(key, group);
  }
  for (const [key, group] of pairGroups) {
    const hasA = group.some((row) => isRegistrarModeA(row));
    const hasB = group.some((row) => !isRegistrarModeA(row));
    const [warehouseId, categoryId] = key.split(':');
    const whName = getWarehouseName(ctx, warehouseId!);
    const catName = getCategoryName(ctx, categoryId!);
    if (hasA && hasB) {
      errors.push(
        `Za skladište „${whName}“ i kategoriju „${catName}“ ne možete kombinovati Režim A i Režim B.`,
      );
      continue;
    }
    if (hasA && group.length > 1) {
      errors.push(
        `Za skladište „${whName}“ i kategoriju „${catName}“ dozvoljen je samo jedan Režim A.`,
      );
    }
  }
  return { valid: errors.length === 0, errors };
};

export const getAvailableCategoriesForRow = (
  scopes: RegistrarScopeAssignment[],
  rowIndex: number,
  ctx: RegistrarAssignmentValidationContext,
): Category[] => {
  const row = scopes[rowIndex];
  if (!row?.warehouseId) {
    return [];
  }
  const warehouseCategoryIds = new Set(getWarehouseCategoryIds(row.warehouseId, ctx));
  const parents = getAssetParentCategories(ctx.categories).filter((cat) =>
    warehouseCategoryIds.has(cat.id),
  );
  const isModeB = Boolean(row.orgUnitId);
  return parents.filter((cat) => {
    const mode = getWarehouseCategoryMode(scopes, row.warehouseId, cat.id, rowIndex);
    if (isModeB) {
      return mode !== 'A';
    }
    return mode !== 'B';
  });
};

export const getAvailableOrgUnitsForRow = (
  scopes: RegistrarScopeAssignment[],
  rowIndex: number,
  ctx: RegistrarAssignmentValidationContext,
): OrgUnit[] => {
  const row = scopes[rowIndex];
  if (!row?.warehouseId || !row.categoryId) {
    return [];
  }
  const mode = getWarehouseCategoryMode(scopes, row.warehouseId, row.categoryId, rowIndex);
  if (mode === 'A') {
    return [];
  }
  const usedOrgIds = new Set(
    scopes
      .filter(
        (scope, index) =>
          index !== rowIndex &&
          scope.warehouseId === row.warehouseId &&
          scope.categoryId === row.categoryId &&
          scope.orgUnitId,
      )
      .map((scope) => scope.orgUnitId!),
  );
  return ctx.orgUnits.filter((unit) => {
    if (usedOrgIds.has(unit.id)) {
      return false;
    }
    return resolveOrgEffectiveWarehouseId(unit.id, ctx) === row.warehouseId;
  });
};

export const normalizeScopeAfterWarehouseChange = (
  scope: RegistrarScopeAssignment,
  ctx: RegistrarAssignmentValidationContext,
): RegistrarScopeAssignment => {
  const categories = getWarehouseCategoryIds(scope.warehouseId, ctx);
  let categoryId = scope.categoryId;
  if (!categories.includes(categoryId)) {
    categoryId = categories[0] ?? '';
  }
  let orgUnitId = scope.orgUnitId ?? null;
  if (orgUnitId) {
    const effective = resolveOrgEffectiveWarehouseId(orgUnitId, ctx);
    if (effective !== scope.warehouseId) {
      orgUnitId = null;
    }
  }
  return { ...scope, categoryId, orgUnitId };
};
