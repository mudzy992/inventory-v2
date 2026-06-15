export const INVENTORY_GUARD_MESSAGES = {
  deleteSessionNotDraft: 'Samo sesije u nacrtu mogu se obrisati.',
  deleteCommitteeNotConfigured: 'Auto-generisani slotovi se ne mogu brisati.',
  deleteCommitteeSessionNotDraft: 'Komisije se mogu brisati samo dok je sesija u nacrtu.',
  activateUnconfiguredSlots: 'Svi slotovi moraju imati dodijeljene članove prije aktivacije.',
  activateListedWithoutCommission:
    'Postoje stavke na listi za rashod bez dodijeljene komisije rashoda.',
} as const;

export interface InventoryGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canDeleteInventorySession = (status: string): InventoryGuardResult => {
  if (status !== 'draft') {
    return { allowed: false, reason: INVENTORY_GUARD_MESSAGES.deleteSessionNotDraft };
  }
  return { allowed: true };
};

export const canDeleteInventoryCommittee = (
  sessionStatus: string,
  membersConfigured: boolean,
): InventoryGuardResult => {
  if (sessionStatus !== 'draft') {
    return { allowed: false, reason: INVENTORY_GUARD_MESSAGES.deleteCommitteeSessionNotDraft };
  }
  if (!membersConfigured) {
    return { allowed: false, reason: INVENTORY_GUARD_MESSAGES.deleteCommitteeNotConfigured };
  }
  return { allowed: true };
};

export const canActivateInventorySession = (input: {
  configuredCommittees: number;
  totalCommittees: number;
  listedWithoutCommission: number;
}): InventoryGuardResult => {
  if (input.configuredCommittees < input.totalCommittees) {
    return { allowed: false, reason: INVENTORY_GUARD_MESSAGES.activateUnconfiguredSlots };
  }
  if (input.listedWithoutCommission > 0) {
    return { allowed: false, reason: INVENTORY_GUARD_MESSAGES.activateListedWithoutCommission };
  }
  return { allowed: true };
};
