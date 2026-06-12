import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { PageId } from '../components/page-id';
import { getDefaultPathForRole } from './app-routes';
import { canAccessPage } from './role-page-access';

interface RequireRoleProps {
  pageId: PageId;
  children: ReactNode;
}

export const RequireRole = ({ pageId, children }: RequireRoleProps) => {
  if (!canAccessPage(pageId)) {
    return <Navigate to={getDefaultPathForRole()} replace />;
  }
  return children;
};
