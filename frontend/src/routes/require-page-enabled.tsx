import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { PageId } from '../components/page-id';
import { useAdminSettings } from '../contexts/admin-settings-context';
import { usePublicSettings } from '../contexts/public-settings-context';
import { isNavPageEnabled } from '../utils/settings-feature.util';
import { getDefaultPathForRole } from './app-routes';

interface RequirePageEnabledProps {
  pageId: PageId;
  children: ReactNode;
}

export const RequirePageEnabled = ({ pageId, children }: RequirePageEnabledProps) => {
  const { settings: publicSettings } = usePublicSettings();
  const { settings: adminSettings } = useAdminSettings();
  if (!isNavPageEnabled(pageId, publicSettings, adminSettings)) {
    return <Navigate to={getDefaultPathForRole()} replace />;
  }
  return children;
};
