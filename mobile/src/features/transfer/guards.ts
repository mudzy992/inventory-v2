import type { AuthUser, Equipment, TransferType } from '@/types/models';

export const canManageTransfers = (user: AuthUser | null): boolean =>
  user?.role === 'admin' || user?.role === 'evidenticar';

export const availableTransferTypes = (
  user: AuthUser | null,
  equipment: Equipment,
  transfersEnabled: boolean,
): TransferType[] => {
  if (!canManageTransfers(user) || !transfersEnabled) {
    return [];
  }
  if (equipment.status === 'skladiste') {
    return ['zaduzenje'];
  }
  if (equipment.status === 'zaduzeno') {
    return ['prenos', 'razduzenje'];
  }
  return [];
};

export const transferTitle = (type: TransferType): string => {
  if (type === 'zaduzenje') {
    return 'Zaduženje opreme';
  }
  if (type === 'prenos') {
    return 'Prenos opreme';
  }
  return 'Razduženje opreme';
};
