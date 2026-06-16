export const INVENTORY_GUARD_MESSAGES = {
  deleteSessionNotDraft: 'Samo sesije u nacrtu mogu se obrisati.',
  deleteCommitteeNotConfigured: 'Auto-generisani slotovi se ne mogu brisati.',
  deleteCommitteeSessionNotDraft: 'Komisije se mogu brisati samo dok je sesija u nacrtu.',
  activateUnconfiguredSlots: 'Svi slotovi moraju imati dodijeljene članove prije aktivacije.',
  activateListedWithoutCommission:
    'Postoje stavke na listi za rashod bez dodijeljene komisije rashoda.',
  activateKeeperMissingEmployeeId:
    'Skladište nema skladištara s povezanim radnikom (employeeId) — popisna komisija se ne može kreirati pri aktivaciji.',
  closeCommitteeAdminBlocked:
    'Administrator ne može zaključiti popisnu listu — to radi predsjednik komisije.',
  closeCommitteeSessionNotActive: 'Zaključavanje je moguće samo dok je sesija aktivna.',
  closeCommitteeAlreadyClosed: 'Lista je već zaključena.',
  closeCommitteeNotMember: 'Samo članovi komisije mogu zaključiti listu.',
  closeCommitteePresidentOnly: 'Samo predsjednik popisne komisije može zaključiti listu.',
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

export const canCloseInventoryCommittee = (input: {
  sessionStatus: string;
  isCommitteeClosed: boolean;
  memberRole?: 'predsjednik' | 'clan' | null;
  isAdmin: boolean;
}): InventoryGuardResult => {
  if (input.isAdmin) {
    return { allowed: false, reason: INVENTORY_GUARD_MESSAGES.closeCommitteeAdminBlocked };
  }
  if (input.sessionStatus !== 'active') {
    return { allowed: false, reason: INVENTORY_GUARD_MESSAGES.closeCommitteeSessionNotActive };
  }
  if (input.isCommitteeClosed) {
    return { allowed: false, reason: INVENTORY_GUARD_MESSAGES.closeCommitteeAlreadyClosed };
  }
  if (!input.memberRole) {
    return { allowed: false, reason: INVENTORY_GUARD_MESSAGES.closeCommitteeNotMember };
  }
  if (input.memberRole !== 'predsjednik') {
    return { allowed: false, reason: INVENTORY_GUARD_MESSAGES.closeCommitteePresidentOnly };
  }
  return { allowed: true };
};
