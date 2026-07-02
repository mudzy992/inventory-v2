import { useMemo } from 'react';
import { useAdminSettings } from '../contexts/admin-settings-context';
import { useAuth } from '../contexts/AuthContext';
import { usePublicSettings } from '../contexts/public-settings-context';
import { PAGE_PATHS, resolveDefaultPath } from '../routes/app-routes';

export const useRoleDefaultPath = (): string => {
  const { user } = useAuth();
  const { settings: publicSettings } = usePublicSettings();
  const { settings: adminSettings } = useAdminSettings();
  return useMemo(
    () => resolveDefaultPath(user?.role ?? null, publicSettings, adminSettings),
    [user?.role, publicSettings, adminSettings],
  );
};

export const useRoleFallbackPath = (currentPageId: keyof typeof PAGE_PATHS): string => {
  const defaultPath = useRoleDefaultPath();
  const currentPath = PAGE_PATHS[currentPageId];
  if (defaultPath !== currentPath) {
    return defaultPath;
  }
  return PAGE_PATHS['my-equipment'];
};
