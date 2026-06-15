export const EMPLOYEE_MESSAGES = {
  notFound: 'Radnik nije pronađen.',
  deleteHasUserAccount:
    'Nije moguće obrisati radnika koji ima korisnički račun. Prvo deaktivirajte ili uklonite pristup u modulu Korisnici.',
  deleteIsOrgSigner: 'Nije moguće obrisati radnika koji je potpisnik organizacijske jedinice.',
  deleteHasSignedTransfers: 'Nije moguće obrisati radnika koji je potpisnik prenosnica.',
  deleteHasHeldEquipment: 'Nije moguće obrisati radnika koji drži opremu na zaduženju.',
  deleteHasOpenRelocation: 'Nije moguće obrisati radnika dok postoji otvoren slučaj premještaja opreme.',
} as const;
