import type { PageId } from '../components/Layout';
import { useAdminSettings } from '../contexts/admin-settings-context';
import { usePublicSettings } from '../contexts/public-settings-context';
import { isNavPageEnabled } from '../utils/settings-feature.util';

export const useIsPageEnabled = (pageId: PageId): boolean => {
  const { settings: publicSettings } = usePublicSettings();
  const { settings: adminSettings } = useAdminSettings();
  return isNavPageEnabled(pageId, publicSettings, adminSettings);
};
