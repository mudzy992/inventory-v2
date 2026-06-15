export const WAREHOUSE_GUARD_MESSAGES = {
  missingKeepers: 'Skladište mora imati barem jednog skladištara.',
  missingOrgUnit: 'Odaberite organizacijsku jedinicu za skladište.',
  missingCity: 'Odaberite grad za skladište.',
  missingName: 'Unesite naziv skladišta.',
} as const;

export interface WarehouseCreateGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canCreateWarehouse = (input: {
  name: string;
  cityId: string;
  orgUnitId: string;
  keeperUserIds: string[];
}): WarehouseCreateGuardResult => {
  if (!input.name.trim()) {
    return { allowed: false, reason: WAREHOUSE_GUARD_MESSAGES.missingName };
  }
  if (!input.cityId) {
    return { allowed: false, reason: WAREHOUSE_GUARD_MESSAGES.missingCity };
  }
  if (!input.orgUnitId) {
    return { allowed: false, reason: WAREHOUSE_GUARD_MESSAGES.missingOrgUnit };
  }
  if (input.keeperUserIds.length === 0) {
    return { allowed: false, reason: WAREHOUSE_GUARD_MESSAGES.missingKeepers };
  }
  return { allowed: true };
};
