import { BadRequestException } from '@nestjs/common';

export const ACCOUNTING_TRACKED_EXCLUSION_MESSAGE =
  'Oprema bez inventurnog broja ne ulazi u knjigovodstvene tokove (popis, rashod, prenosnice).';

export interface EquipmentAccountingFields {
  isAccountingTracked: boolean;
  inventoryNumber: string | null;
}

export const normalizeInventoryNumber = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const isAccountingTrackedEquipment = (
  equipment: Pick<EquipmentAccountingFields, 'isAccountingTracked' | 'inventoryNumber'>,
): boolean => {
  if (!equipment.isAccountingTracked) {
    return false;
  }
  return normalizeInventoryNumber(equipment.inventoryNumber) !== null;
};

export const getEquipmentInventoryLabel = (
  equipment: Pick<EquipmentAccountingFields, 'inventoryNumber'>,
): string => normalizeInventoryNumber(equipment.inventoryNumber) ?? 'Bez inv. broja';

export const requiresTransferDocument = isAccountingTrackedEquipment;
export const isInventoryCountable = isAccountingTrackedEquipment;
export const isDisposalEligible = isAccountingTrackedEquipment;

export const resolveIssueAccountingFields = (input: {
  isAccountingTracked?: boolean;
  inventoryNumber?: string;
}): EquipmentAccountingFields => {
  const isAccountingTracked = input.isAccountingTracked !== false;
  const inventoryNumber = isAccountingTracked
    ? normalizeInventoryNumber(input.inventoryNumber)
    : null;
  return { isAccountingTracked, inventoryNumber };
};

export const assertEquipmentAccountingFields = (fields: EquipmentAccountingFields): void => {
  const inventoryNumber = normalizeInventoryNumber(fields.inventoryNumber);
  if (fields.isAccountingTracked) {
    if (!inventoryNumber) {
      throw new BadRequestException('Inventurni broj je obavezan za knjigovodstveno vođenu opremu');
    }
    return;
  }
  if (inventoryNumber !== null) {
    throw new BadRequestException(
      'Evidencijska oprema (bez knjigovodstvenog vođenja) ne smije imati inventurni broj',
    );
  }
};

export const assertEquipmentAccountingUpgrade = (input: {
  existing: EquipmentAccountingFields;
  next: EquipmentAccountingFields;
}): void => {
  const existingTracked = input.existing.isAccountingTracked;
  const nextTracked = input.next.isAccountingTracked;
  if (existingTracked && !nextTracked) {
    throw new BadRequestException('Knjigovodstveno vođena oprema se ne može prebaciti u evidencijsku');
  }
  if (existingTracked && nextTracked) {
    const nextNumber = normalizeInventoryNumber(input.next.inventoryNumber);
    if (!nextNumber) {
      throw new BadRequestException('Inventurni broj je obavezan za knjigovodstveno vođenu opremu');
    }
    return;
  }
  if (!existingTracked && nextTracked) {
    const nextNumber = normalizeInventoryNumber(input.next.inventoryNumber);
    if (!nextNumber) {
      throw new BadRequestException(
        'Inventurni broj je obavezan pri prelasku opreme u knjigovodstveno vođenu',
      );
    }
  }
  assertEquipmentAccountingFields(input.next);
};
