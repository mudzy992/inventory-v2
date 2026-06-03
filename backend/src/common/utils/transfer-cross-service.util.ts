import type { OrgUnit } from '../../../generated/prisma/client';

interface EmployeeOrgRef {
  id: string;
  orgUnitId: string;
}

const buildOrgChain = (orgUnitId: string, orgUnits: OrgUnit[]): string[] => {
  const byId = new Map(orgUnits.map((unit) => [unit.id, unit]));
  const chain: string[] = [];
  let current = byId.get(orgUnitId);
  while (current) {
    chain.unshift(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
};

export const detectCrossServiceTransfer = (
  fromEmployee: EmployeeOrgRef | null,
  toEmployee: EmployeeOrgRef | null,
  orgUnits: OrgUnit[],
): boolean => {
  if (!fromEmployee || !toEmployee) {
    return false;
  }
  if (fromEmployee.orgUnitId === toEmployee.orgUnitId) {
    return false;
  }
  const fromChain = buildOrgChain(fromEmployee.orgUnitId, orgUnits);
  const toChain = buildOrgChain(toEmployee.orgUnitId, orgUnits);
  if (fromChain.includes(toEmployee.orgUnitId) || toChain.includes(fromEmployee.orgUnitId)) {
    return false;
  }
  for (let index = 0; index < Math.min(fromChain.length, toChain.length); index += 1) {
    if (fromChain[index] !== toChain[index]) {
      const divergeParentId = index > 0 ? fromChain[index - 1] : null;
      const divergeParent = divergeParentId
        ? orgUnits.find((unit) => unit.id === divergeParentId)
        : null;
      if (divergeParent) {
        const branchTypes = ['sektor', 'sluzba', 'odjeljenje'];
        if (branchTypes.includes(divergeParent.type)) {
          return false;
        }
      }
      return true;
    }
  }
  return false;
};
