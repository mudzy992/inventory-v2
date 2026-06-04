import type { PageId } from '../components/Layout';
import { getPageFeatureSettingKey } from './page-feature-settings.util';

export const isSettingFlagEnabled = (
  key: string,
  settings: Record<string, string | number | boolean>,
  fallback = true,
): boolean => {
  const value = settings[key];
  return typeof value === 'boolean' ? value : fallback;
};

export const isNavPageEnabled = (
  pageId: PageId,
  publicSettings: Record<string, string | number | boolean>,
  _adminSettings: Record<string, string | number | boolean>,
): boolean => {
  if (pageId === 'settings') {
    return true;
  }
  const featureKey = getPageFeatureSettingKey(pageId);
  if (!featureKey) {
    return true;
  }
  return isSettingFlagEnabled(featureKey, publicSettings);
};
