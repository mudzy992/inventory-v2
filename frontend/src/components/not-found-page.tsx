import { useNavigate } from 'react-router-dom';
import { getDefaultPathForRole } from '../routes/app-routes';
import { HttpStatusPage } from './ui/http-status-page';

export const NotFoundPage = () => {
  const navigate = useNavigate();
  return (
    <HttpStatusPage
      status={404}
      actionLabel="Na početnu"
      onAction={() => navigate(getDefaultPathForRole(), { replace: true })}
    />
  );
};
