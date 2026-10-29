import type { OrgUnit } from '@/types/models';

const chainOf = (orgUnits: OrgUnit[], orgUnitId: string): string[] => {
  const chain: string[] = [];
  let current = orgUnits.find((row) => row.id === orgUnitId);
  while (current) {
    chain.unshift(current.id);
    current = orgUnits.find((row) => row.id === current!.parentId);
  }
  return chain;
};

export const isCrossServiceTransfer = (
  orgUnits: OrgUnit[],
  fromOrgUnitId?: string,
  toOrgUnitId?: string,
): boolean => {
  if (!fromOrgUnitId || !toOrgUnitId || fromOrgUnitId === toOrgUnitId) {
    return false;
  }
  const fromChain = chainOf(orgUnits, fromOrgUnitId);
  const toChain = chainOf(orgUnits, toOrgUnitId);
  const fromUnit = orgUnits.find((row) => row.id === fromOrgUnitId);
  const toUnit = orgUnits.find((row) => row.id === toOrgUnitId);
  if (!fromUnit || !toUnit) {
    return true;
  }
  if (fromChain.includes(toOrgUnitId) || toChain.includes(fromOrgUnitId)) {
    return false;
  }
  for (let i = 0; i < Math.min(fromChain.length, toChain.length); i += 1) {
    if (fromChain[i] !== toChain[i]) {
      const diverge = i > 0 ? orgUnits.find((row) => row.id === fromChain[i - 1]) : null;
      if (diverge && ['sektor', 'sluzba', 'odjeljenje'].includes(diverge.type)) {
        return false;
      }
      return true;
    }
  }
  return false;
};
