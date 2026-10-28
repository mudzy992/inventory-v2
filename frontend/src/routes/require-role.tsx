import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PageId } from '../components/page-id';
import { HttpStatusPage } from '../components/ui/http-status-page';
import { useAuth } from '../contexts/AuthContext';
import { useEffectiveSettings } from '../hooks/use-effective-settings';
import { useRoleDefaultPath } from '../hooks/use-role-default-path';
import { canAccessPageForRole } from './role-page-access';

interface RequireRoleProps {
  pageId: PageId;
  children: ReactNode;
}

export const RequireRole = ({ pageId, children }: RequireRoleProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getBoolean: getEffectiveBoolean } = useEffectiveSettings();
  const defaultPath = useRoleDefaultPath();
  // BM-3: moderator_role dynamic activation/deactivation
  const roleForAccess = (user?.role === 'moderator' && getEffectiveBoolean('features.moderator_role', true) === false)
    ? 'user'
    : user?.role;
  if (!canAccessPageForRole(pageId, roleForAccess)) {
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
