export const MAINTENANCE_PARTS_GUARD_MESSAGES = {
  categoryNotLinked:
    'Maintenance kategorija nije povezana s kategorijom ove opreme.',
  hostRashodovana: 'Nije moguće ugraditi dio na rashodovanu opremu.',
  insufficientQuantity: 'Nedovoljna količina na maintenance lotu.',
  partAlreadyRemoved: 'Dio je već uklonjen.',
  onlyActiveCanBeFaulty: 'Samo aktivni dijelovi mogu biti označeni kao neispravni.',
  cannotReplaceRemoved: 'Nije moguće zamijeniti uklonjeni dio.',
} as const;

export interface MaintenancePartsGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canInstallMaintenancePart = (input: {
  hostStatus: string;
  hasCategoryLink: boolean;
  availableQuantity: number;
  requestedQuantity?: number;
}): MaintenancePartsGuardResult => {
  if (input.hostStatus === 'rashodovano' || input.hostStatus === 'za_rashod') {
    return { allowed: false, reason: MAINTENANCE_PARTS_GUARD_MESSAGES.hostRashodovana };
  }
  if (!input.hasCategoryLink) {
    return { allowed: false, reason: MAINTENANCE_PARTS_GUARD_MESSAGES.categoryNotLinked };
  }
  const qty = input.requestedQuantity ?? 1;
  if (input.availableQuantity < qty) {
    return { allowed: false, reason: MAINTENANCE_PARTS_GUARD_MESSAGES.insufficientQuantity };
  }
  return { allowed: true };
};

export const canMarkPartFaulty = (status: string): MaintenancePartsGuardResult => {
  if (status !== 'active') {
    return { allowed: false, reason: MAINTENANCE_PARTS_GUARD_MESSAGES.onlyActiveCanBeFaulty };
  }
  return { allowed: true };
};

export const canRemoveMaintenancePart = (status: string): MaintenancePartsGuardResult => {
  if (status === 'removed') {
    return { allowed: false, reason: MAINTENANCE_PARTS_GUARD_MESSAGES.partAlreadyRemoved };
  }
  return { allowed: true };
};

export const canReplaceMaintenancePart = (status: string): MaintenancePartsGuardResult => {
  if (status === 'removed') {
    return { allowed: false, reason: MAINTENANCE_PARTS_GUARD_MESSAGES.cannotReplaceRemoved };
  }
  return { allowed: true };
};
