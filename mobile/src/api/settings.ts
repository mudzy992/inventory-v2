import { apiRequest } from './client';

export type SettingsMap = Record<string, string | number | boolean>;

const asBoolean = (value: string | number | boolean | undefined, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fallback;
};

export const fetchPublicSettingsApi = (): Promise<SettingsMap> =>
  apiRequest<SettingsMap>('/settings/public');

export const fetchEffectiveSettingsApi = (): Promise<SettingsMap> =>
  apiRequest<SettingsMap>('/settings/effective');

export const isFlagEnabled = (
  settings: SettingsMap,
  key: string,
  fallback = true,
): boolean => asBoolean(settings[key], fallback);
