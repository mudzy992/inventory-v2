import { BadRequestException } from '@nestjs/common';
import type { OrgUnitTreeLink } from './collect-open-org-subtree.util';

export interface ModeratorOrgAssignmentRow {
  id: string;
  name: string;
  parentId: string | null;
}

const buildAncestorChain = (
  unitId: string,
  unitsById: Map<string, ModeratorOrgAssignmentRow>,
): string[] => {
  const chain: string[] = [];
  let currentId: string | null = unitId;
  while (currentId) {
    chain.push(currentId);
    const unit = unitsById.get(currentId);
    currentId = unit?.parentId ?? null;
  }
  return chain;
};

const isDescendantOf = (
  descendantId: string,
  ancestorId: string,
  unitsById: Map<string, ModeratorOrgAssignmentRow>,
): boolean => {
  if (descendantId === ancestorId) {
    return false;
  }
  const chain = buildAncestorChain(descendantId, unitsById);
  return chain.includes(ancestorId);
};

export const assertModeratorOrgAssignmentsNotRedundant = (
  assignments: ModeratorOrgAssignmentRow[],
  allOrgUnits: ModeratorOrgAssignmentRow[],
): void => {
  if (assignments.length < 2) {
    return;
  }
  const unitsById = new Map(allOrgUnits.map((row) => [row.id, row]));
  for (let index = 0; index < assignments.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < assignments.length; otherIndex += 1) {
      const left = assignments[index]!;
      const right = assignments[otherIndex]!;
      if (isDescendantOf(right.id, left.id, unitsById)) {
        throw new BadRequestException(
          `${right.name} je već pokrivena dodjelom ${left.name}`,
        );
      }
      if (isDescendantOf(left.id, right.id, unitsById)) {
        throw new BadRequestException(
          `${left.name} je već pokrivena dodjelom ${right.name}`,
        );
      }
    }
  }
};

export const isOrgUnitCoveredByModeratorAssignments = (
  unitId: string,
  assignmentIds: string[],
  allOrgUnits: OrgUnitTreeLink[],
): boolean => {
  if (assignmentIds.length === 0) {
    return false;
  }
  const unitsById = new Map(allOrgUnits.map((row) => [row.id, row]));
  const chain = buildAncestorChain(unitId, unitsById as Map<string, ModeratorOrgAssignmentRow>);
  return chain.some((id) => assignmentIds.includes(id));
};
