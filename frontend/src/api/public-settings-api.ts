import { apiRequest } from './client';

export interface PublicSettingDto {
  key: string;
  scope?: 'public' | 'private';
  valueType?: string;
  value: string | number | boolean;
  description?: string;
  group?: string;
  adminEditable?: boolean;
}

export const fetchPublicSettingsApi = (): Promise<PublicSettingDto[]> =>
  apiRequest<PublicSettingDto[]>('/settings/public');

const normalizeSettingValue = (row: PublicSettingDto): string | number | boolean => {
  if (row.valueType === 'boolean') {
    return row.value === true || row.value === 'true';
  }
  if (row.valueType === 'number') {
    const numeric = typeof row.value === 'number' ? row.value : Number(row.value);
    return Number.isNaN(numeric) ? row.value : numeric;
  }
  return row.value;
};

export const publicSettingsToMap = (
  rows: PublicSettingDto[],
): Record<string, string | number | boolean> => {
  const map: Record<string, string | number | boolean> = {};
  for (const row of rows) {
    map[row.key] = normalizeSettingValue(row);
  }
  return map;
};
