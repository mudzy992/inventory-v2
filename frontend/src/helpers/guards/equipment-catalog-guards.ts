export const EQUIPMENT_CATALOG_GUARD_MESSAGES = {
  deleteInUse: 'Stavka šifrarnika je u upotrebi na opremi i ne može se obrisati.',
} as const;

export interface CatalogDeleteGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canDeleteCatalogItem = (inUseCount: number): CatalogDeleteGuardResult => {
  if (inUseCount > 0) {
    return { allowed: false, reason: EQUIPMENT_CATALOG_GUARD_MESSAGES.deleteInUse };
  }
  return { allowed: true };
};
