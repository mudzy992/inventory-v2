export const WAREHOUSE_STOCK_MESSAGES = {
  lotClosed: 'Lot je zatvoren i specifikacija se ne može mijenjati.',
  lotNotReadyForIssue: 'Popunite specifikaciju lota prije izdavanja.',
  noUnitsRemaining: 'Na lotu nema preostalih komada.',
  crossWarehouseAdminOnly: 'Cross-warehouse izdavanje dostupno je samo administratoru.',
  crossWarehouseDisabled: 'Cross-warehouse izdavanje je isključeno u postavkama.',
  catalogItemRequired: 'Cross-warehouse izdavanje zahtijeva stavku šifrarnika na lotu.',
  maintenanceLotRejected: 'MAINTENANCE lot se ne može izdati putem skladišne robe.',
} as const;
