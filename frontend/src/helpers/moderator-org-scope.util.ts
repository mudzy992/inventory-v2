import type { OrgUnit } from '../types';

export const MODERATOR_ASSIGNABLE_ORG_TYPES = [
  'direkcija',
  'distribucija',
  'podrucje',
  'podruznica',
  'poslovna_jedinica',
  'sektor',
  'sluzba',
  'odjeljenje',
] as const;

const buildAncestorChain = (unitId: string, orgUnits: OrgUnit[]): string[] => {
  const chain: string[] = [];
  let currentId: string | null = unitId;
  while (currentId) {
    chain.push(currentId);
    const unit = orgUnits.find((row) => row.id === currentId);
    currentId = unit?.parentId ?? null;
  }
  return chain;
};

export const isOrgUnitCoveredByModeratorAssignments = (
  unitId: string,
  assignmentOrgUnitIds: string[],
  orgUnits: OrgUnit[],
): boolean => {
  if (assignmentOrgUnitIds.length === 0) {
    return false;
  }
  const chain = buildAncestorChain(unitId, orgUnits);
  return chain.some((id) => assignmentOrgUnitIds.includes(id));
};

export const findModeratorOrgAssignmentRedundancy = (
  orgUnitId: string,
  assignmentOrgUnitIds: string[],
  orgUnits: OrgUnit[],
): string | null => {
  const unit = orgUnits.find((row) => row.id === orgUnitId);
  if (!unit) {
    return null;
  }
  for (const assignmentId of assignmentOrgUnitIds) {
    if (assignmentId === orgUnitId) {
      continue;
    }
    const anchor = orgUnits.find((row) => row.id === assignmentId);
    if (!anchor) {
      continue;
    }
    if (isOrgUnitCoveredByModeratorAssignments(orgUnitId, [assignmentId], orgUnits)) {
      return `${unit.name} je već pokrivena dodjelom ${anchor.name}`;
    }
    if (isOrgUnitCoveredByModeratorAssignments(assignmentId, [orgUnitId], orgUnits)) {
      return `${anchor.name} je već pokrivena dodjelom ${unit.name}`;
    }
  }
  return null;
};
