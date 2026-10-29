import type { OrgUnit } from '@/types/models';

export const resolveEffectiveSignerId = (unitId: string, units: OrgUnit[]): string | null => {
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

export const getEffectiveCityForOrgUnit = (orgUnits: OrgUnit[], unitId: string): string | null => {
  let current = orgUnits.find((unit) => unit.id === unitId);
  while (current) {
    if (current.effectiveLocationCityId) {
      return current.effectiveLocationCityId;
    }
    if (current.locationCityId) {
      return current.locationCityId;
    }
    current = orgUnits.find((unit) => unit.id === current!.parentId);
  }
  return null;
};
