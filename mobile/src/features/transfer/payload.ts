import type { AuthUser, CatalogState, Employee, Equipment, TransferType } from '@/types/models';
import { isCrossServiceTransfer } from './cross-service';
import { resolveEffectiveSignerId } from './signer';
import { resolveTransferWarehousePayload } from './warehouse';

interface Input {
  catalog: CatalogState;
  user: AuthUser | null;
  equipment: Equipment;
  type: TransferType;
  toPerson?: Employee | null;
  reason?: string;
  manualPreuzeoLabel?: string;
}

export const buildTransferCreatePayload = (
  input: Input,
): { payload?: Record<string, unknown>; error?: string } => {
  const { catalog, user, equipment, type, toPerson, reason, manualPreuzeoLabel } = input;
  if ((type === 'zaduzenje' || type === 'prenos') && !toPerson) {
    return { error: 'Odaberite osobu na koju prenosite opremu.' };
  }
  if (type === 'rashodovanje') {
    return { error: 'Rashodovanje preko prenosnice nije dostupno.' };
  }
  const toPersonOrgUnitId = toPerson?.orgUnitId;
  const fromOrgUnitId = equipment.currentHolder?.orgUnitId;
  if (type === 'prenos' && user?.role === 'evidenticar') {
    if (isCrossServiceTransfer(catalog.orgUnits, fromOrgUnitId ?? undefined, toPersonOrgUnitId)) {
      return { error: 'Prenos izvan vašeg opsega može izvršiti samo administrator.' };
    }
  }
  const warehousePayload = resolveTransferWarehousePayload(type, equipment, user, catalog);
  if (type === 'zaduzenje' && !warehousePayload.fromWarehouseId) {
    return { error: 'Zaduženje zahtijeva skladište izvora.' };
  }
  if (type === 'razduzenje' && !warehousePayload.toWarehouseId) {
    return { error: 'Razduženje zahtijeva ciljno skladište.' };
  }
  const signerSource = type === 'razduzenje' ? fromOrgUnitId : toPersonOrgUnitId;
  const signerId = signerSource ? resolveEffectiveSignerId(signerSource, catalog.orgUnits) ?? '' : '';
  const crossService =
    type === 'prenos' && isCrossServiceTransfer(catalog.orgUnits, fromOrgUnitId ?? undefined, toPersonOrgUnitId);
  return {
    payload: {
      equipmentId: equipment.id,
      type,
      fromType: equipment.status === 'zaduzeno' ? 'osoba' : 'skladiste',
      fromPersonId: equipment.currentHolderId || undefined,
      toType: type === 'razduzenje' ? 'skladiste' : 'osoba',
      toPersonId: type === 'zaduzenje' || type === 'prenos' ? toPerson?.id : undefined,
      signerId,
      date: new Date().toISOString().slice(0, 10),
      reason: reason || undefined,
      manualPreuzeoLabel:
        type === 'zaduzenje' || type === 'razduzenje' ? manualPreuzeoLabel?.trim() || undefined : undefined,
      isCrossServiceTransfer: crossService,
      ...warehousePayload,
    },
  };
};
