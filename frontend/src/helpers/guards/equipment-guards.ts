export const EQUIPMENT_GUARD_MESSAGES = {
  warehouseRequired: 'Odaberite skladište za opremu na skladištu.',
  leafCategoryRequired: 'Oprema mora biti u podkategoriji (leaf).',
  deleteNotAllowed: 'Brisanje opreme nije dozvoljeno u ovom statusu.',
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
