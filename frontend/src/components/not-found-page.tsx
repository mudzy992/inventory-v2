import { useNavigate } from 'react-router-dom';
import { useRoleDefaultPath } from '../hooks/use-role-default-path';
import { HttpStatusPage } from './ui/http-status-page';

export const NotFoundPage = () => {
  const navigate = useNavigate();
  const defaultPath = useRoleDefaultPath();
  return (
    <HttpStatusPage
      status={404}
      actionLabel="Na početnu"
      onAction={() => navigate(defaultPath, { replace: true })}
    />
  );
};
