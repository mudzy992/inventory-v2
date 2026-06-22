import type { OrgUnitType } from '../types';

const ALLOWED_CHILD_TYPES: Record<OrgUnitType, readonly OrgUnitType[]> = {
  direkcija: ['podrucje', 'distribucija', 'sektor', 'sluzba'],
  podrucje: ['podruznica', 'sektor', 'sluzba'],
  distribucija: ['podruznica', 'sektor', 'sluzba'],
  podruznica: ['poslovna_jedinica', 'sektor', 'sluzba'],
  poslovna_jedinica: ['sektor', 'sluzba', 'odjeljenje'],
  sektor: ['sluzba', 'odjeljenje'],
  sluzba: ['odjeljenje'],
  odjeljenje: [],
};

const ALL_ORG_UNIT_TYPES: readonly OrgUnitType[] = [
  'direkcija',
  'distribucija',
  'podrucje',
  'podruznica',
  'poslovna_jedinica',
  'sektor',
  'sluzba',
  'odjeljenje',
];

export const getAllowedChildTypes = (parentType: OrgUnitType | null): readonly OrgUnitType[] => {
  if (!parentType) {
    return ['direkcija'];
  }
  return ALLOWED_CHILD_TYPES[parentType];
};

export const getCreatableOrgUnitTypes = (parentId: string | null, parentType: OrgUnitType | null): OrgUnitType[] => {
  if (!parentId) {
    return ['direkcija'];
  }
  if (!parentType) {
    return [];
  }
  return [...ALLOWED_CHILD_TYPES[parentType]];
};

export const ALL_ORG_UNIT_TYPE_OPTIONS: readonly OrgUnitType[] = ALL_ORG_UNIT_TYPES;

export const ROOT_ORG_UNIT_TYPES: readonly OrgUnitType[] = ['direkcija'];

export const isAllowedOrgUnitParentChild = (
  parentType: OrgUnitType | null,
  childType: OrgUnitType,
): boolean => {
  if (!parentType) {
    return ROOT_ORG_UNIT_TYPES.includes(childType);
  }
  return ALLOWED_CHILD_TYPES[parentType].includes(childType);
};

export const canUseRootParent = (childType: OrgUnitType): boolean =>
  ROOT_ORG_UNIT_TYPES.includes(childType);

/** Visible forest roots when the org list is scoped (e.g. moderator subtree). */
export const getOrgTreeRootUnits = <T extends { id: string; parentId: string | null }>(
  orgUnits: T[],
): T[] => {
  const visibleIds = new Set(orgUnits.map((row) => row.id));
  return orgUnits.filter((row) => row.parentId === null || !visibleIds.has(row.parentId));
};
