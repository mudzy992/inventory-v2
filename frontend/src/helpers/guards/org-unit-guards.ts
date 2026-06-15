import { ORG_HIERARCHY_MESSAGES } from '../org-hierarchy-messages';
import type { Employee, OrgUnit } from '../../types';

export interface OrgUnitDeleteGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canDeleteOrgUnit = (
  unitId: string,
  orgUnits: OrgUnit[],
  employees: Employee[],
): OrgUnitDeleteGuardResult => {
  const hasChildren = orgUnits.some((row) => row.parentId === unitId);
  if (hasChildren) {
    return { allowed: false, reason: ORG_HIERARCHY_MESSAGES.deleteHasChildren };
  }
  const hasEmployees = employees.some((row) => row.orgUnitId === unitId);
  if (hasEmployees) {
    return { allowed: false, reason: ORG_HIERARCHY_MESSAGES.deleteHasEmployees };
  }
  return { allowed: true };
};
