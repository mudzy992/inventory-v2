import { apiRequest } from './client';

export interface SettingDependsOnDto {
  key: string;
  equals?: boolean | string | number;
}

export type SettingDisplayDto = 'default' | 'info' | 'deprecated';

export interface SettingDto {
  key: string;
  scope: 'public' | 'private';
  valueType: string;
  value: string | number | boolean;
  label: string;
  description: string;
  detail?: string;
  group: string;
  adminEditable: boolean;
  dependsOn?: SettingDependsOnDto;
  display: SettingDisplayDto;
}

export const fetchPrivateSettingsApi = (): Promise<SettingDto[]> =>
  apiRequest<SettingDto[]>('/settings/private');

export const fetchEffectiveSettingsApi = (): Promise<Record<string, string | number | boolean>> =>
  apiRequest<Record<string, string | number | boolean>>('/settings/effective');

export const patchSettingApi = (
  key: string,
  value: string | number | boolean,
): Promise<SettingDto> =>
  apiRequest<SettingDto>(`/settings/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  });
