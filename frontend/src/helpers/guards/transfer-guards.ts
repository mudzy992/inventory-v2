export const TRANSFER_GUARD_MESSAGES = {
  missingRecipient: 'Odaberite osobu na koju prenosite opremu.',
  crossServiceEvidenticar:
    'Prenos izvan vašeg opsega (grad/kategorija) može izvršiti samo administrator.',
  missingSigner: 'Nije konfigurisan potpisnik u hijerarhiji za ovu operaciju.',
  generationDisabled: 'Generisanje prenosnica je isključeno u postavkama.',
} as const;

export interface TransferGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canCreateTransferType = (
  type: string,
  settings: Record<string, unknown>,
): TransferGuardResult => {
  if (settings['transfer.generation.enabled'] === false) {
    return { allowed: false, reason: TRANSFER_GUARD_MESSAGES.generationDisabled };
  }
  const typeKey = `transfer.generation.on_${type}` as const;
  if (settings[typeKey] === false) {
    return { allowed: false, reason: TRANSFER_GUARD_MESSAGES.generationDisabled };
  }
  return { allowed: true };
};
