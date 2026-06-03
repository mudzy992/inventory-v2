import { apiRequest } from './client';

export interface PublicSettingDto {
  key: string;
  value: string | number | boolean;
}

export const fetchPublicSettingsApi = (): Promise<PublicSettingDto[]> =>
  apiRequest<PublicSettingDto[]>('/settings/public');

export const publicSettingsToMap = (
  rows: PublicSettingDto[],
): Record<string, string | number | boolean> => {
  const map: Record<string, string | number | boolean> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
};
