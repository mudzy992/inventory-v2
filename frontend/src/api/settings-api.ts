import { apiRequest } from './client';

export interface SettingDto {
  key: string;
  scope: 'public' | 'private';
  valueType: string;
  value: string | number | boolean;
  label: string;
  description: string;
  group: string;
  adminEditable: boolean;
}

export const fetchPrivateSettingsApi = (): Promise<SettingDto[]> =>
  apiRequest<SettingDto[]>('/settings/private');

export const patchSettingApi = (
  key: string,
  value: string | number | boolean,
): Promise<SettingDto> =>
  apiRequest<SettingDto>(`/settings/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  });
