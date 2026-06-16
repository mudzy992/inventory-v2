export const TRANSFER_MESSAGES = {
  rashodovanjeBlocked:
    'Rashod opreme ide preko liste za rashod u nacrtu sesije popisa, ne preko prenosnice rashodovanje.',
  crossServiceAdminOnly:
    'Prenos izvan vašeg opsega (grad/kategorija) može izvršiti samo administrator.',
  generationDisabled: 'Generisanje prenosnica je isključeno u postavkama.',
  missingSigner: 'Nije konfigurisan potpisnik u hijerarhiji za ovu operaciju.',
  uploadRequiredBeforeSign: 'Upload potpisane prenosnice (PDF) prije finalizacije.',
  cancelNotAllowed: 'Prenosnica se ne može otkazati u ovom statusu.',
  markPrintedNotAllowed: 'Samo neobrađene prenosnice mogu biti označene kao odštampane.',
} as const;
