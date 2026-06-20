import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PageId } from '../components/page-id';
import { HttpStatusPage } from '../components/ui/http-status-page';
import { getDefaultPathForRole } from './app-routes';
import { canAccessPage } from './role-page-access';

interface RequireRoleProps {
  pageId: PageId;
  children: ReactNode;
}

export const RequireRole = ({ pageId, children }: RequireRoleProps) => {
  const navigate = useNavigate();
  if (!canAccessPage(pageId)) {
    return (
      <HttpStatusPage
        status={403}
        description="Nemate dozvolu za pristup ovoj stranici."
        actionLabel="Na početnu"
        onAction={() => navigate(getDefaultPathForRole(), { replace: true })}
      />
    );
  }
  return children;
};
