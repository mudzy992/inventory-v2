import type { WarehouseStockLotStatus } from '../../types';

export const WAREHOUSE_STOCK_GUARD_MESSAGES = {
  lotClosed: 'Lot je zatvoren i specifikacija se ne može mijenjati.',
  lotNotReadyForIssue: 'Popunite specifikaciju lota prije izdavanja.',
  noUnitsRemaining: 'Na lotu nema preostalih komada.',
  crossWarehouseAdminOnly: 'Cross-warehouse izdavanje dostupno je samo administratoru.',
  crossWarehouseDisabled: 'Cross-warehouse izdavanje je isključeno u postavkama.',
  catalogItemRequired: 'Cross-warehouse izdavanje zahtijeva stavku šifrarnika na lotu.',
} as const;

export interface WarehouseStockGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canEditLotSpecifications = (
  status: WarehouseStockLotStatus,
): WarehouseStockGuardResult => {
  if (status === 'zatvoreno') {
    return { allowed: false, reason: WAREHOUSE_STOCK_GUARD_MESSAGES.lotClosed };
  }
  return { allowed: true };
};

export const canIssueFromLot = (input: {
  status: WarehouseStockLotStatus;
  quantityOnHand: number;
}): WarehouseStockGuardResult => {
  if (input.status !== 'spremno_za_izdavanje') {
    return { allowed: false, reason: WAREHOUSE_STOCK_GUARD_MESSAGES.lotNotReadyForIssue };
  }
  if (input.quantityOnHand <= 0) {
    return { allowed: false, reason: WAREHOUSE_STOCK_GUARD_MESSAGES.noUnitsRemaining };
  }
  return { allowed: true };
};

export const canCrossWarehouseIssue = (input: {
  isAdmin: boolean;
  allowSetting: boolean;
  catalogItemId?: string | null;
}): WarehouseStockGuardResult => {
  if (!input.allowSetting) {
    return { allowed: false, reason: WAREHOUSE_STOCK_GUARD_MESSAGES.crossWarehouseDisabled };
  }
  if (!input.isAdmin) {
    return { allowed: false, reason: WAREHOUSE_STOCK_GUARD_MESSAGES.crossWarehouseAdminOnly };
  }
  if (!input.catalogItemId) {
    return { allowed: false, reason: WAREHOUSE_STOCK_GUARD_MESSAGES.catalogItemRequired };
  }
  return { allowed: true };
};
