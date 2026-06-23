import type { AuthenticatedUser } from '../types/authenticated-user.type';

export const isSelfEmployeeId = (
  user: AuthenticatedUser,
  employeeId: string | null | undefined,
): boolean => Boolean(user.employeeId && employeeId && user.employeeId === employeeId);

export const isOwnHeldEquipmentListQuery = (
  user: AuthenticatedUser,
  currentHolderId: string | null | undefined,
): boolean => isSelfEmployeeId(user, currentHolderId);

export const isOwnTransfersListQuery = (
  user: AuthenticatedUser,
  personId: string | null | undefined,
): boolean => isSelfEmployeeId(user, personId);

export const isEquipmentHeldByUser = (
  user: AuthenticatedUser,
  equipment: { currentHolderId: string | null },
): boolean => Boolean(user.employeeId && equipment.currentHolderId === user.employeeId);

export const isTransferInvolvingUser = (
  user: AuthenticatedUser,
  transfer: { fromPersonId: string | null; toPersonId: string | null },
): boolean =>
  Boolean(
    user.employeeId &&
      (transfer.fromPersonId === user.employeeId || transfer.toPersonId === user.employeeId),
  );
