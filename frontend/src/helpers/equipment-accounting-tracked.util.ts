import type { Equipment } from '../types';

export const getEquipmentPrimaryLabel = (
  equipment: Pick<Equipment, 'inventoryNumber'>,
): string => equipment.inventoryNumber?.trim() || 'Bez inv. broja';

export const getEquipmentTrackingBadge = (
  equipment: Pick<Equipment, 'isAccountingTracked'>,
): string | null => (equipment.isAccountingTracked ? null : 'Evidencijska');

export const getEquipmentQrFilenameLabel = (
  equipment: Pick<Equipment, 'id' | 'inventoryNumber'>,
): string => {
  const inventoryNumber = equipment.inventoryNumber?.trim();
  if (inventoryNumber) {
    return inventoryNumber;
  }
  return `EV-${equipment.id.slice(0, 8).toUpperCase()}`;
};

export const isAccountingTrackedEquipment = (
  equipment: Pick<Equipment, 'isAccountingTracked' | 'inventoryNumber'>,
): boolean => {
  if (!equipment.isAccountingTracked) {
    return false;
  }
  return Boolean(equipment.inventoryNumber?.trim());
};
