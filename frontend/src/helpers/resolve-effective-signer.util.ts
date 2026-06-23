import type { OrgUnit, OrgUnitSignerSummary } from '../types';

export type OrgUnitSignerRow = Pick<OrgUnit, 'id' | 'parentId' | 'signerId'> & {
  signer?: OrgUnitSignerSummary | null;
  effectiveSigner?: OrgUnitSignerSummary | null;
};

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

/** Display podaci potpisnika iz org. stabla (bez GET /employees — van registrar scope-a). */
export const resolveEffectiveSignerDisplay = (
  unitId: string,
  units: OrgUnitSignerRow[],
): OrgUnitSignerSummary | null => {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  let currentId: string | null = unitId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const unit = byId.get(currentId);
    if (!unit) {
      return null;
    }
    if (unit.effectiveSigner) {
      return unit.effectiveSigner;
    }
    if (unit.signerId && unit.signer) {
      return unit.signer;
    }
    currentId = unit.parentId;
  }
  return null;
};
