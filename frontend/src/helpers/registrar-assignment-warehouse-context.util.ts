import { resolveEffectiveWarehouseApi } from '../api/warehouses-api';
import type { OrgUnit, RegistrarScopeAssignment, Warehouse } from '../types';
import { getOrgSubtreeIds } from './org-warehouse.util';
import { isOrgUnitCoveredByModeratorAssignments } from './moderator-org-scope.util';

export const mergeWarehousesById = (base: Warehouse[], extra: Warehouse[]): Warehouse[] => {
  const byId = new Map(base.map((row) => [row.id, row]));
  for (const row of extra) {
    if (!byId.has(row.id)) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
};

const collectUniqueOrgUnitIds = (orgUnitIds: string[]): string[] => [...new Set(orgUnitIds.filter(Boolean))];

export const resolveEffectiveWarehousesForOrgUnits = async (
  orgUnitIds: string[],
): Promise<Warehouse[]> => {
  const warehouses: Warehouse[] = [];
  const seenWarehouseIds = new Set<string>();
  for (const orgUnitId of collectUniqueOrgUnitIds(orgUnitIds)) {
    try {
      const result = await resolveEffectiveWarehouseApi(orgUnitId);
      if (result.warehouse && !seenWarehouseIds.has(result.warehouse.id)) {
        seenWarehouseIds.add(result.warehouse.id);
        warehouses.push(result.warehouse);
      }
    } catch {
      // ignore single resolve failures
    }
  }
  return warehouses;
};

export const collectModeratorScopeOrgUnitIds = (
  moderatorOrgRootIds: string[],
  orgUnits: OrgUnit[],
): string[] => {
  const ids = new Set<string>();
  for (const rootId of moderatorOrgRootIds) {
    for (const orgUnitId of getOrgSubtreeIds(orgUnits, rootId)) {
      ids.add(orgUnitId);
    }
  }
  return [...ids];
};

export const buildRegistrarAssignmentWarehouses = async (input: {
  baseWarehouses: Warehouse[];
  registrarScopes: RegistrarScopeAssignment[];
  orgUnits: OrgUnit[];
  moderatorOrgRootIds?: string[];
}): Promise<Warehouse[]> => {
  const orgUnitIds = [
    ...input.registrarScopes.map((scope) => scope.orgUnitId).filter((id): id is string => Boolean(id)),
  ];
  if (input.moderatorOrgRootIds && input.moderatorOrgRootIds.length > 0) {
    const scopedOrgIds = collectModeratorScopeOrgUnitIds(input.moderatorOrgRootIds, input.orgUnits);
    const sluzbaOrgIds = scopedOrgIds.filter((id) => {
      const unit = input.orgUnits.find((row) => row.id === id);
      return unit?.type === 'sluzba' || unit?.type === 'odjeljenje';
    });
    orgUnitIds.push(...sluzbaOrgIds);
  }
  const effectiveWarehouses = await resolveEffectiveWarehousesForOrgUnits(orgUnitIds);
  return mergeWarehousesById(input.baseWarehouses, effectiveWarehouses);
};

export const isOrgUnitInModeratorRegistrarScope = (
  orgUnitId: string,
  moderatorOrgRootIds: string[],
  orgUnits: OrgUnit[],
): boolean => isOrgUnitCoveredByModeratorAssignments(orgUnitId, moderatorOrgRootIds, orgUnits);
