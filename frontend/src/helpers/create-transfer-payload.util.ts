import { getSignerIdForOrgUnit } from '../helpers';
import type { AppState, Equipment, TransferType, UserAccount } from '../types';
import { isCrossServiceTransfer } from '../store';
import { resolveTransferWarehousePayload } from './transfer-warehouse.util';

export interface BuildTransferPayloadInput {
  state: AppState;
  user: UserAccount | null;
  equipment: Equipment;
  type: TransferType;
  toPersonId?: string;
  toPersonOrgUnitId?: string;
  reason?: string;
  date?: string;
  notes?: string;
  admin: boolean;
  evidenticar: boolean;
}

export interface BuildTransferPayloadResult {
  payload?: Record<string, unknown>;
  error?: string;
  targetWarehouseId?: string;
}

const resolveSignerId = (
  orgUnits: AppState['orgUnits'],
  type: TransferType,
  equipment: Equipment,
  toPersonOrgUnitId?: string,
): string => {
  if (type === 'zaduzenje' || type === 'prenos') {
    if (toPersonOrgUnitId) {
      return getSignerIdForOrgUnit(orgUnits, toPersonOrgUnitId) ?? '';
    }
    return '';
  }
  if (type === 'razduzenje' && equipment.currentHolder?.orgUnitId) {
    return getSignerIdForOrgUnit(orgUnits, equipment.currentHolder.orgUnitId) ?? '';
  }
  if (type === 'rashodovanje') {
    if (equipment.currentHolder?.orgUnitId) {
      return getSignerIdForOrgUnit(orgUnits, equipment.currentHolder.orgUnitId) ?? '';
    }
    const dirUnit = orgUnits.find((row) => row.type === 'direkcija');
    if (dirUnit) {
      return getSignerIdForOrgUnit(orgUnits, dirUnit.id) ?? '';
    }
    return '';
  }
  return '';
};

export const buildTransferCreatePayload = (
  input: BuildTransferPayloadInput,
): BuildTransferPayloadResult => {
  const {
    state,
    user,
    equipment,
    type,
    toPersonId,
    toPersonOrgUnitId,
    reason,
    date,
    notes,
    admin,
    evidenticar,
  } = input;

  if ((type === 'zaduzenje' || type === 'prenos') && !toPersonId) {
    return { error: 'Odaberite osobu na koju prenosite opremu.' };
  }

  const fromOrgUnitId = equipment.currentHolder?.orgUnitId;
  if (type === 'prenos' && evidenticar && !admin) {
    const crossService = isCrossServiceTransfer(fromOrgUnitId, toPersonOrgUnitId);
    if (crossService) {
      return { error: 'Prenos izvan vašeg opsega (grad/kategorija) može izvršiti samo administrator.' };
    }
  }

  if (type === 'rashodovanje') {
    return { error: 'Rashodovanje preko prenosnice nije dostupno — koristite modul Popis i komisiju za rashod.' };
  }

  const warehousePayload = resolveTransferWarehousePayload(type, equipment, user, state);
  if (type === 'zaduzenje' && !warehousePayload.fromWarehouseId) {
    return { error: 'Zaduženje zahtijeva skladište izvora (oprema mora biti na skladištu).' };
  }
  if (type === 'razduzenje' && !warehousePayload.toWarehouseId) {
    return { error: 'Razduženje zahtijeva ciljno skladište (nije definisano u hijerarhiji ili dodjeli).' };
  }

  const crossService = type === 'prenos' && isCrossServiceTransfer(fromOrgUnitId, toPersonOrgUnitId);

  return {
    payload: {
      equipmentId: equipment.id,
      type,
      fromType: equipment.status === 'zaduzeno' ? 'osoba' : 'skladiste',
      fromPersonId: equipment.currentHolderId || undefined,
      toType: type === 'razduzenje' ? 'skladiste' : type === 'rashodovanje' ? 'rashod' : 'osoba',
      toPersonId: type === 'zaduzenje' || type === 'prenos' ? toPersonId : undefined,
      signerId: resolveSignerId(state.orgUnits, type, equipment, toPersonOrgUnitId),
      date: date ?? new Date().toISOString().slice(0, 10),
      reason: reason || undefined,
      notes: notes || undefined,
      isCrossServiceTransfer: crossService,
      ...warehousePayload,
    },
    targetWarehouseId: warehousePayload.toWarehouseId,
  };
};

export const canSignDisposalTransfer = (
  transfer: { type: TransferType; status: string },
): boolean => transfer.type === 'rashodovanje' && transfer.status === 'raw';
