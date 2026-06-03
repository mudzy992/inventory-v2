import { getSignerForEmployee } from '../helpers';
import type { AppState, Equipment, TransferType, UserAccount } from '../types';
import { isCrossServiceTransfer } from '../store';
import { resolveTransferWarehousePayload } from './transfer-warehouse.util';

export interface BuildTransferPayloadInput {
  state: AppState;
  user: UserAccount | null;
  equipment: Equipment;
  type: TransferType;
  toPersonId?: string;
  reason?: string;
  date?: string;
  notes?: string;
  admin: boolean;
  evidenticar: boolean;
  hasDisposalCommission?: boolean;
}

export interface BuildTransferPayloadResult {
  payload?: Record<string, unknown>;
  error?: string;
  targetWarehouseId?: string;
}

const resolveSignerId = (
  state: AppState,
  type: TransferType,
  equipment: Equipment,
  toPersonId?: string,
): string => {
  if (type === 'zaduzenje' || type === 'prenos') {
    const signer = getSignerForEmployee(state, toPersonId ?? '');
    return signer?.id || state.employees[0]?.id || '';
  }
  if (type === 'razduzenje' && equipment.currentHolderId) {
    const signer = getSignerForEmployee(state, equipment.currentHolderId);
    return signer?.id || state.employees[0]?.id || '';
  }
  if (type === 'rashodovanje') {
    if (equipment.currentHolderId) {
      const signer = getSignerForEmployee(state, equipment.currentHolderId);
      return signer?.id || state.employees[0]?.id || '';
    }
    const dirUnit = state.orgUnits.find((row) => row.type === 'direkcija');
    return dirUnit?.signerId || state.employees[0]?.id || '';
  }
  return state.employees[0]?.id || '';
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
    reason,
    date,
    notes,
    admin,
    evidenticar,
    hasDisposalCommission = true,
  } = input;

  if ((type === 'zaduzenje' || type === 'prenos') && !toPersonId) {
    return { error: 'Odaberite osobu na koju prenosite opremu.' };
  }

  if (type === 'prenos' && evidenticar && !admin) {
    const crossService = isCrossServiceTransfer(equipment.currentHolderId, toPersonId);
    if (crossService) {
      return { error: 'Prenos izvan vašeg opsega (grad/kategorija) može izvršiti samo administrator.' };
    }
  }

  if (type === 'rashodovanje' && evidenticar && !admin && !hasDisposalCommission) {
    return { error: 'Nema aktivne komisije za rashod u gradu zaduženog radnika.' };
  }

  const warehousePayload = resolveTransferWarehousePayload(type, equipment, user, state);
  if (type === 'zaduzenje' && !warehousePayload.fromWarehouseId) {
    return { error: 'Zaduženje zahtijeva skladište izvora (oprema mora biti na skladištu).' };
  }
  if (type === 'razduzenje' && !warehousePayload.toWarehouseId) {
    return { error: 'Razduženje zahtijeva ciljno skladište (nije definisano u hijerarhiji ili dodjeli).' };
  }

  const crossService =
    type === 'prenos' && isCrossServiceTransfer(equipment.currentHolderId, toPersonId);

  return {
    payload: {
      equipmentId: equipment.id,
      type,
      fromType: equipment.status === 'zaduzeno' ? 'osoba' : 'skladiste',
      fromPersonId: equipment.currentHolderId || undefined,
      toType: type === 'razduzenje' ? 'skladiste' : type === 'rashodovanje' ? 'rashod' : 'osoba',
      toPersonId: type === 'zaduzenje' || type === 'prenos' ? toPersonId : undefined,
      signerId: resolveSignerId(state, type, equipment, toPersonId),
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
  transfer: { type: TransferType; status: string; disposalApproval?: { status: string } },
): boolean => {
  if (transfer.type !== 'rashodovanje') {
    return transfer.status === 'raw';
  }
  if (!transfer.disposalApproval) {
    return transfer.status === 'raw';
  }
  return transfer.status === 'raw' && transfer.disposalApproval.status === 'approved';
};
