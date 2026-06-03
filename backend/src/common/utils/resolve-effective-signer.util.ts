export interface OrgUnitSignerRow {
  id: string;
  parentId: string | null;
  signerId: string | null;
}

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

export const buildEffectiveSignerMap = (
  units: OrgUnitSignerRow[],
): Map<string, string | null> => {
  const result = new Map<string, string | null>();
  for (const unit of units) {
    result.set(unit.id, resolveEffectiveSignerId(unit.id, units));
  }
  return result;
};
