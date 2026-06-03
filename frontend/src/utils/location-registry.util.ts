import type { Canton, City } from '../types';

export interface CantonWithCities extends Canton {
  cities: City[];
}

export interface LocationRegistryStats {
  cantonCount: number;
  cityCount: number;
  hasDuplicateCantonIds: boolean;
  rawCantonCount: number;
}

const compareNames = (left: string, right: string): number =>
  left.localeCompare(right, 'bs');

export const buildLocationRegistry = (
  cantons: Canton[],
  cities: City[],
): { rows: CantonWithCities[]; stats: LocationRegistryStats } => {
  const seenCantonIds = new Set<string>();
  const uniqueCantons: Canton[] = [];
  let hasDuplicateCantonIds = false;
  for (const canton of cantons) {
    if (!canton.id) {
      hasDuplicateCantonIds = true;
      continue;
    }
    if (seenCantonIds.has(canton.id)) {
      hasDuplicateCantonIds = true;
      continue;
    }
    seenCantonIds.add(canton.id);
    const { cities: _nested, ...rest } = canton;
    uniqueCantons.push(rest);
  }
  const seenCityIds = new Set<string>();
  const uniqueCities: City[] = [];
  for (const city of cities) {
    if (!city.id || seenCityIds.has(city.id)) {
      continue;
    }
    seenCityIds.add(city.id);
    uniqueCities.push(city);
  }
  const rows = uniqueCantons
    .map((canton) => ({
      ...canton,
      cities: uniqueCities
        .filter((city) => city.cantonId === canton.id)
        .sort((a, b) => compareNames(a.name, b.name)),
    }))
    .sort((a, b) => compareNames(a.name, b.name));
  return {
    rows,
    stats: {
      cantonCount: rows.length,
      cityCount: uniqueCities.length,
      hasDuplicateCantonIds,
      rawCantonCount: cantons.length,
    },
  };
};

export const formatCantonDisplayName = (name: string): string => {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : '(bez naziva)';
};
