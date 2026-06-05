import type { PageId } from '../components/Layout';
import { PUBLIC_FEATURE_DEFAULTS } from '../constants/public-feature-defaults';
import { getPageFeatureSettingKey } from './page-feature-settings.util';

const coerceSettingBoolean = (value: string | number | boolean | undefined): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
};

export const isSettingFlagEnabled = (
  key: string,
  settings: Record<string, string | number | boolean>,
  fallback?: boolean,
): boolean => {
  const coerced = coerceSettingBoolean(settings[key]);
  if (coerced !== undefined) {
    return coerced;
  }
  if (key in PUBLIC_FEATURE_DEFAULTS) {
    return PUBLIC_FEATURE_DEFAULTS[key];
  }
  return fallback ?? true;
};

const mergeFeatureSettings = (
  publicSettings: Record<string, string | number | boolean>,
  adminSettings: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> => ({ ...publicSettings, ...adminSettings });

export const isNavPageEnabled = (
  pageId: PageId,
  publicSettings: Record<string, string | number | boolean>,
  adminSettings: Record<string, string | number | boolean>,
): boolean => {
  if (pageId === 'settings') {
    return true;
  }
  const featureKey = getPageFeatureSettingKey(pageId);
  if (!featureKey) {
    return true;
  }
  const merged = mergeFeatureSettings(publicSettings, adminSettings);
  const publicCoerced = coerceSettingBoolean(publicSettings[featureKey]);
  if (publicCoerced !== undefined) {
    return publicCoerced;
  }
  return isSettingFlagEnabled(featureKey, merged);
};
