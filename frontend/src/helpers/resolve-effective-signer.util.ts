import type { OrgUnit } from '../types';

export type OrgUnitSignerRow = Pick<OrgUnit, 'id' | 'parentId' | 'signerId'>;

/** Nearest-wins: prvi eksplicitni `signerId` na lancu prema korijenu. */
export const resolveEffectiveSignerId = (
  unitId: string,
  units: OrgUnitSignerRow[],
): string | null => {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  let currentId: string | null = unitId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const unit = byId.get(currentId);
    if (!unit) {
      return null;
    }
    if (unit.signerId) {
      return unit.signerId;
    }
    currentId = unit.parentId;
  }
  return null;
};
