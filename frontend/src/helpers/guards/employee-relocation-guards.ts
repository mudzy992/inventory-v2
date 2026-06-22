export const EMPLOYEE_RELOCATION_GUARD_MESSAGES = {
  catalogRequiredForTransfer:
    'Oprema nema stavku šifrarnika — mapirajte tip prije prebacivanja.',
  freezeBlocked: 'Aktivan popis blokira ovu akciju premještaja opreme.',
} as const;

export interface EmployeeRelocationGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canTransferRelocationLine = (input: {
  catalogItemId?: string | null;
  effectiveCatalogItemId?: string | null;
}): EmployeeRelocationGuardResult => {
  if (!input.catalogItemId && !input.effectiveCatalogItemId) {
    return { allowed: false, reason: EMPLOYEE_RELOCATION_GUARD_MESSAGES.catalogRequiredForTransfer };
  }
  return { allowed: true };
};

export const canResolveRelocationWhileFrozen = (input: {
  isFrozen: boolean;
  canBypassFreeze: boolean;
}): EmployeeRelocationGuardResult => {
  if (input.isFrozen && !input.canBypassFreeze) {
    return { allowed: false, reason: EMPLOYEE_RELOCATION_GUARD_MESSAGES.freezeBlocked };
  }
  return { allowed: true };
};
