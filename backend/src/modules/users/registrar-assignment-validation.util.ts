import { BadRequestException } from '@nestjs/common';
import type { RegistrarScopeAssignment } from '../../common/types/registrar-scope.type';
import {
  resolveEffectiveWarehouseId,
  type OrgUnitWarehouseRow,
  type WarehouseRow,
} from '../../common/utils/resolve-effective-warehouse.util';
import type { PrismaService } from '../../prisma/prisma.service';

const isRegistrarModeA = (assignment: RegistrarScopeAssignment): boolean =>
  !assignment.orgUnitId;

const scopePairKey = (warehouseId: string, categoryId: string): string =>
  `${warehouseId}:${categoryId}`;

const rowKey = (scope: RegistrarScopeAssignment): string =>
  `${scope.warehouseId}:${scope.categoryId}:${scope.orgUnitId ?? '__A__'}`;

const resolveRootCategoryId = (
  categoryId: string,
  categories: { id: string; parentId: string | null }[],
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

const loadValidationContext = async (prisma: PrismaService) => {
  const [categories, warehouses, orgUnits, equipmentRows, lotRows] = await Promise.all([
    prisma.category.findMany({
      select: { id: true, name: true, parentId: true, categoryKind: true },
    }),
    prisma.warehouse.findMany({
      select: { id: true, name: true, orgUnitId: true, cityId: true, isActive: true, createdAt: true },
    }),
    prisma.orgUnit.findMany({ select: { id: true, name: true, parentId: true } }),
    prisma.equipment.findMany({
      where: { warehouseId: { not: null } },
      select: { warehouseId: true, categoryId: true },
    }),
    prisma.warehouseStockLot.findMany({
      select: { warehouseId: true, categoryId: true },
    }),
  ]);
  const warehouseCategoryRoots = new Map<string, Set<string>>();
  const addCategoryForWarehouse = (warehouseId: string, categoryId: string): void => {
    const rootId = resolveRootCategoryId(categoryId, categories);
    const existing = warehouseCategoryRoots.get(warehouseId) ?? new Set<string>();
    existing.add(rootId);
    warehouseCategoryRoots.set(warehouseId, existing);
  };
  for (const row of equipmentRows) {
    if (row.warehouseId) {
      addCategoryForWarehouse(row.warehouseId, row.categoryId);
    }
  }
  for (const row of lotRows) {
    addCategoryForWarehouse(row.warehouseId, row.categoryId);
  }
  const assetParentIds = categories
    .filter((row) => row.parentId === null && row.categoryKind === 'ASSET')
    .map((row) => row.id);
  return {
    categories,
    warehouses,
    orgUnits,
    warehouseCategoryRoots,
    assetParentIds,
  };
};

const getWarehouseCategoryIds = (
  warehouseId: string,
  ctx: Awaited<ReturnType<typeof loadValidationContext>>,
): string[] => {
  const fromData = ctx.warehouseCategoryRoots.get(warehouseId);
  if (fromData && fromData.size > 0) {
    return [...fromData];
  }
  return ctx.assetParentIds;
};

const resolveOrgEffectiveWarehouseId = (
  orgUnitId: string,
  orgUnits: OrgUnitWarehouseRow[],
  warehouses: WarehouseRow[],
): string | null =>
  resolveEffectiveWarehouseId(orgUnitId, orgUnits, warehouses, null);

export const assertRegistrarScopesValid = async (
  prisma: PrismaService,
  scopes: RegistrarScopeAssignment[],
): Promise<void> => {
  if (scopes.length === 0) {
    return;
  }
  const ctx = await loadValidationContext(prisma);
  const warehouseById = new Map(ctx.warehouses.map((row) => [row.id, row.name]));
  const categoryById = new Map(ctx.categories.map((row) => [row.id, row.name]));
  const orgById = new Map(ctx.orgUnits.map((row) => [row.id, row.name]));
  const seenKeys = new Set<string>();
  for (const scope of scopes) {
    const key = rowKey(scope);
    if (seenKeys.has(key)) {
      throw new BadRequestException(
        'Duplikat dodjele (isto skladište, kategorija i org. jedinica).',
      );
    }
    seenKeys.add(key);
    const allowed = getWarehouseCategoryIds(scope.warehouseId, ctx);
    if (!allowed.includes(scope.categoryId)) {
      throw new BadRequestException(
        `Kategorija „${categoryById.get(scope.categoryId) ?? scope.categoryId}“ nije dostupna za skladište „${warehouseById.get(scope.warehouseId) ?? scope.warehouseId}“.`,
      );
    }
    if (scope.orgUnitId) {
      const effectiveWarehouseId = resolveOrgEffectiveWarehouseId(
        scope.orgUnitId,
        ctx.orgUnits,
        ctx.warehouses,
      );
      if (effectiveWarehouseId !== scope.warehouseId) {
        const effectiveName = effectiveWarehouseId
          ? (warehouseById.get(effectiveWarehouseId) ?? effectiveWarehouseId)
          : 'nepoznato';
        throw new BadRequestException(
          `Org. jedinica „${orgById.get(scope.orgUnitId) ?? scope.orgUnitId}“ pripada skladištu „${effectiveName}“, a ne „${warehouseById.get(scope.warehouseId) ?? scope.warehouseId}“.`,
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
    const whName = warehouseById.get(warehouseId!) ?? warehouseId;
    const catName = categoryById.get(categoryId!) ?? categoryId;
    if (hasA && hasB) {
      throw new BadRequestException(
        `Za skladište „${whName}“ i kategoriju „${catName}“ ne možete kombinovati Režim A i Režim B.`,
      );
    }
    if (hasA && group.length > 1) {
      throw new BadRequestException(
        `Za skladište „${whName}“ i kategoriju „${catName}“ dozvoljen je samo jedan Režim A.`,
      );
    }
  }
};
