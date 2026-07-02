import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PageId } from '../components/page-id';
import { HttpStatusPage } from '../components/ui/http-status-page';
import { useAuth } from '../contexts/AuthContext';
import { useRoleDefaultPath } from '../hooks/use-role-default-path';
import { canAccessPageForRole } from './role-page-access';

interface RequireRoleProps {
  pageId: PageId;
  children: ReactNode;
}

export const RequireRole = ({ pageId, children }: RequireRoleProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const defaultPath = useRoleDefaultPath();
  if (!canAccessPageForRole(pageId, user?.role)) {
    return (
      <HttpStatusPage
        status={403}
        description="Nemate dozvolu za pristup ovoj stranici."
        actionLabel="Na početnu"
        onAction={() => navigate(defaultPath, { replace: true })}
      />
    );
  }
  return children;
};
