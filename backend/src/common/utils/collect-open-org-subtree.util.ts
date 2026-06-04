export interface OrgUnitTreeLink {
  id: string;
  parentId: string | null;
}

export type OrgUnitInheritanceBlockerField = 'signerId' | 'locationCityId';

const buildChildrenByParent = (units: OrgUnitTreeLink[]): Map<string | null, string[]> => {
  const childrenByParent = new Map<string | null, string[]>();
  for (const unit of units) {
    const siblings = childrenByParent.get(unit.parentId) ?? [];
    siblings.push(unit.id);
    childrenByParent.set(unit.parentId, siblings);
  }
  return childrenByParent;
};

/**
 * IDs of root and descendants that inherit through root for the given field.
 * Skips entire branches where a child already defines the field (own signer / location).
 */
export const collectOpenSubtreeIds = <T extends OrgUnitTreeLink & Record<string, unknown>>(
  rootId: string,
  units: T[],
  blockerField: OrgUnitInheritanceBlockerField,
): string[] => {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const childrenByParent = buildChildrenByParent(units);
  const result: string[] = [];
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    for (const childId of childrenByParent.get(id) ?? []) {
      const child = byId.get(childId);
      if (!child) {
        continue;
      }
      if (child[blockerField]) {
        continue;
      }
      queue.push(childId);
    }
  }
  return result;
};

export const collectAllOrgUnitIds = (units: OrgUnitTreeLink[]): string[] =>
  units.map((unit) => unit.id);
