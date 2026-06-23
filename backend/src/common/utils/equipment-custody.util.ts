import type { TransferType } from '../../../generated/prisma/client';

export const CUSTODY_POOL_LOOKUP_NOT_FOUND_MESSAGE =
  'Nije u vašem poolu vraćene opreme, pogrešan inventurni broj ili nije na skladištu.';

export const buildCustodyUpdateOnTransferFinalize = (
  type: TransferType,
  fromPersonOrgUnitId?: string | null,
): { custodyOrgUnitId?: string | null } => {
  if (type === 'razduzenje' && fromPersonOrgUnitId) {
    return { custodyOrgUnitId: fromPersonOrgUnitId };
  }
  if (type === 'zaduzenje') {
    return { custodyOrgUnitId: null };
  }
  return {};
};
