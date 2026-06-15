export const EMPLOYEE_GUARD_MESSAGES = {
  deleteHasUserAccount:
    'Nije moguće obrisati radnika koji ima korisnički račun. Prvo deaktivirajte ili uklonite pristup u modulu Korisnici.',
  deleteIsOrgSigner: 'Nije moguće obrisati radnika koji je potpisnik organizacijske jedinice.',
  deleteHasSignedTransfers: 'Nije moguće obrisati radnika koji je potpisnik prenosnica.',
  deleteHasHeldEquipment: 'Nije moguće obrisati radnika koji drži opremu na zaduženju.',
  deleteHasOpenRelocation: 'Nije moguće obrisati radnika dok postoji otvoren slučaj premještaja opreme.',
} as const;

export interface EmployeeDeleteGuardResult {
  allowed: boolean;
  reason?: string;
}

export interface EmployeeDeleteGuardInput {
  employeeId: string;
  hasUserAccount: boolean;
  isOrgSigner: boolean;
  signedTransferCount: number;
  heldEquipmentCount: number;
  openRelocationCount: number;
}

export const canDeleteEmployee = (input: EmployeeDeleteGuardInput): EmployeeDeleteGuardResult => {
  if (input.hasUserAccount) {
    return { allowed: false, reason: EMPLOYEE_GUARD_MESSAGES.deleteHasUserAccount };
  }
  if (input.isOrgSigner) {
    return { allowed: false, reason: EMPLOYEE_GUARD_MESSAGES.deleteIsOrgSigner };
  }
  if (input.signedTransferCount > 0) {
    return { allowed: false, reason: EMPLOYEE_GUARD_MESSAGES.deleteHasSignedTransfers };
  }
  if (input.heldEquipmentCount > 0) {
    return { allowed: false, reason: EMPLOYEE_GUARD_MESSAGES.deleteHasHeldEquipment };
  }
  if (input.openRelocationCount > 0) {
    return { allowed: false, reason: EMPLOYEE_GUARD_MESSAGES.deleteHasOpenRelocation };
  }
  return { allowed: true };
};
