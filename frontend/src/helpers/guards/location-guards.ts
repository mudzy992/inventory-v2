import type { Canton, City, OrgUnit, Warehouse } from '../../types';

export const LOCATION_GUARD_MESSAGES = {
  deleteCantonHasCities: 'Nije moguće obrisati kanton koji još ima gradove.',
  deleteCityReferenced:
    'Nije moguće obrisati grad koji je vezan na org. jedinice, skladišta ili komisije rashoda.',
} as const;

export interface LocationDeleteGuardResult {
  allowed: boolean;
  reason?: string;
}

export const canDeleteCanton = (cantonId: string, cities: City[]): LocationDeleteGuardResult => {
  const hasCities = cities.some((row) => row.cantonId === cantonId);
  if (hasCities) {
    return { allowed: false, reason: LOCATION_GUARD_MESSAGES.deleteCantonHasCities };
  }
  return { allowed: true };
};

export const canDeleteCity = (
  cityId: string,
  orgUnits: OrgUnit[],
  warehouses: Warehouse[],
): LocationDeleteGuardResult => {
  const referencedByOrg = orgUnits.some(
    (row) => row.locationCityId === cityId || row.effectiveLocationCityId === cityId,
  );
  const referencedByWarehouse = warehouses.some((row) => row.cityId === cityId);
  if (referencedByOrg || referencedByWarehouse) {
    return { allowed: false, reason: LOCATION_GUARD_MESSAGES.deleteCityReferenced };
  }
  return { allowed: true };
};

export const countCantonCities = (canton: Canton & { cities?: City[] }): number =>
  canton.cities?.length ?? 0;
