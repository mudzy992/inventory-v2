export const DISPOSAL_MESSAGES = {
  disposalRequiresWarehouse:
    'Oprema mora biti razdužena na skladište prije dodavanja na listu za rashod.',
  disposalReasonRequired: 'Razlog rashoda je obavezan (najmanje 3 znaka).',
  sessionNotDraft: 'Lista za rashod dostupna je samo u nacrtu sesije popisa.',
  removeAdminOnly: 'Samo administrator može povući stavku s liste za rashod.',
  removeListedOnly: 'Moguće je povući samo stavke u statusu na listi.',
  presidentOnlyReview: 'Samo predsjednik komisije rashoda može donijeti odluku.',
  rejectionReasonRequired: 'Obrazloženje odbijanja je obavezno.',
} as const;
