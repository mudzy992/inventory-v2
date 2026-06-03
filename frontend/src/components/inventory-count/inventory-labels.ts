import type { InventoryLineStatus, InventorySessionStatus } from '../../api/inventory-api';
import type { BadgeProps } from '../ui/badge';

export const getInventorySessionStatusLabel = (status: InventorySessionStatus): string => {
  const labels: Record<InventorySessionStatus, string> = {
    draft: 'Nacrt',
    active: 'Aktivna',
    closing: 'Zatvaranje',
    closed: 'Zatvorena',
  };
  return labels[status];
};

export const getInventorySessionStatusTone = (
  status: InventorySessionStatus,
): BadgeProps['tone'] => {
  const tones: Record<InventorySessionStatus, BadgeProps['tone']> = {
    draft: 'neutral',
    active: 'info',
    closing: 'warning',
    closed: 'success',
  };
  return tones[status];
};

export const getInventoryLineStatusLabel = (status: InventoryLineStatus): string => {
  const labels: Record<InventoryLineStatus, string> = {
    prisutna: 'Prisutna',
    ostecena: 'Oštećena',
    promjena_lokacije: 'Promjena lokacije',
    nije_prisutna: 'Nije prisutna',
    predlozen_rashod: 'Predložen rashod',
  };
  return labels[status];
};

export const INVENTORY_LINE_STATUS_OPTIONS: InventoryLineStatus[] = [
  'prisutna',
  'ostecena',
  'promjena_lokacije',
  'nije_prisutna',
  'predlozen_rashod',
];
