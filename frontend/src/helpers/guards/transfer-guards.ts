export const TRANSFER_GUARD_MESSAGES = {
  missingRecipient: 'Odaberite osobu na koju prenosite opremu.',
  crossServiceEvidenticar:
    'Prenos izvan vašeg opsega (grad/kategorija) može izvršiti samo administrator.',
  missingSigner: 'Nije konfigurisan potpisnik u hijerarhiji za ovu operaciju.',
  transfersDisabled: 'Prenos opreme je isključen u postavkama.',
  rashodovanjeBlocked:
    'Rashod opreme ide preko liste za rashod u nacrtu sesije popisa, ne preko prenosnice rashodovanje.',
  uploadRequiredBeforeSign: 'Upload potpisane prenosnice (PDF) prije finalizacije.',
} as const;

export interface TransferGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canPerformEquipmentTransfer = (
  type: string,
  settings: Record<string, unknown>,
): TransferGuardResult => {
  if (type === 'rashodovanje') {
    return { allowed: false, reason: TRANSFER_GUARD_MESSAGES.rashodovanjeBlocked };
  }
  if (settings['features.transfers'] === false) {
    return { allowed: false, reason: TRANSFER_GUARD_MESSAGES.transfersDisabled };
  }
  return { allowed: true };
};

export const willGenerateTransferDocument = (
  type: string,
  settings: Record<string, unknown>,
): boolean => {
  if (type === 'rashodovanje') {
    return false;
  }
  if (settings['transfer.generation.enabled'] === false) {
    return false;
  }
  const typeKey = `transfer.generation.on_${type}` as const;
  if (settings[typeKey] === false) {
    return false;
  }
  return true;
};

/** @deprecated Use canPerformEquipmentTransfer */
export const canCreateTransferType = canPerformEquipmentTransfer;

export const canCreateCrossServiceTransfer = (input: {
  isCrossService: boolean;
  isAdmin: boolean;
  crossServiceEnabled: boolean;
}): TransferGuardResult => {
  if (!input.isCrossService) {
    return { allowed: true };
  }
  if (!input.crossServiceEnabled) {
    return { allowed: false, reason: TRANSFER_GUARD_MESSAGES.crossServiceEvidenticar };
  }
  if (!input.isAdmin) {
    return { allowed: false, reason: TRANSFER_GUARD_MESSAGES.crossServiceEvidenticar };
  }
  return { allowed: true };
};

export const canSignTransfer = (input: {
  hasUploadedPdf: boolean;
  requireSignedUpload: boolean;
  allowFinalizeWithoutUpload: boolean;
}): TransferGuardResult => {
  if (input.allowFinalizeWithoutUpload) {
    return { allowed: true };
  }
  if (input.requireSignedUpload && !input.hasUploadedPdf) {
    return { allowed: false, reason: TRANSFER_GUARD_MESSAGES.uploadRequiredBeforeSign };
  }
  return { allowed: true };
};

export const canFinalizeTransfer = (status: string): TransferGuardResult => {
  if (status === 'potpisan' || status === 'cancelled') {
    return { allowed: false, reason: 'Prenosnica je već završena ili otkazana.' };
  }
  if (status === 'raw' || status === 'uploaded' || status === 'printed') {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Nepoznat status prenosnice.' };
};

export const isTransferAwaitingFinalize = (status: string): boolean =>
  status === 'uploaded' || status === 'printed';
