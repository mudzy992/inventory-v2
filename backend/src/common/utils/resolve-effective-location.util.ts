export interface OrgUnitLocationRow {
  id: string;
  parentId: string | null;
  locationCityId: string | null;
}

export const resolveEffectiveLocationCityId = (
  unitId: string,
  units: OrgUnitLocationRow[],
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
    if (unit.locationCityId) {
      return unit.locationCityId;
    }
    currentId = unit.parentId;
  }
  return null;
};

export const buildEffectiveLocationMap = (
  units: OrgUnitLocationRow[],
): Map<string, string | null> => {
  const result = new Map<string, string | null>();
  for (const unit of units) {
    result.set(unit.id, resolveEffectiveLocationCityId(unit.id, units));
  }
  return result;
};
