export const EQUIPMENT_GUARD_MESSAGES = {
  warehouseRequired: 'Odaberite skladište za opremu na skladištu.',
  leafCategoryRequired: 'Oprema mora biti u podkategoriji (leaf).',
  deleteNotAllowed: 'Brisanje opreme nije dozvoljeno u ovom statusu.',
  reactivateAdminOnly: 'Samo administrator može reaktivirati opremu.',
  reactivateInvalidState:
    'Reaktivacija je moguća samo za rashodovanu opremu označenu kao uništenu na skladištu.',
  reactivateReasonRequired: 'Unesite obrazloženje reaktivacije.',
} as const;

export interface EquipmentGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canSaveEquipmentWarehouse = (
  status: string,
  warehouseId: string,
): EquipmentGuardResult => {
  if (status === 'skladiste' && !warehouseId) {
    return { allowed: false, reason: EQUIPMENT_GUARD_MESSAGES.warehouseRequired };
  }
  return { allowed: true };
};

export const canReactivateEquipment = (input: {
  isAdmin: boolean;
  status: string;
  warehouseCondition?: string | null;
}): EquipmentGuardResult => {
  if (!input.isAdmin) {
    return { allowed: false, reason: EQUIPMENT_GUARD_MESSAGES.reactivateAdminOnly };
  }
  if (input.status !== 'rashodovano' || input.warehouseCondition !== 'unisteno') {
    return { allowed: false, reason: EQUIPMENT_GUARD_MESSAGES.reactivateInvalidState };
  }
  return { allowed: true };
};
