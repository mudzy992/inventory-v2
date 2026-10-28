import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePublicSettings } from '../contexts/public-settings-context';
import { buildCompanyAddressLine, companyHeaderFromSettings } from '../helpers/company-header.util';
import { ApiError } from '../api/client';
import { EVIDENS_APP_NAME, EVIDENS_APP_SUBTITLE } from './ui/app-brand';
import { AuthShell } from './ui/auth-shell';
import { LoginForm } from './LoginForm';

interface LoginPageProps {
  onLoginSuccess: () => void;
  setupSuccessMessage?: string;
}

export function LoginPage({ onLoginSuccess, setupSuccessMessage }: LoginPageProps) {
  const { login } = useAuth();
  const { settings } = usePublicSettings();
  const company = companyHeaderFromSettings(settings);
  const appName =
    (typeof settings['app.name'] === 'string' && settings['app.name']) ||
    (import.meta.env.VITE_APP_NAME as string) ||
    EVIDENS_APP_NAME;
  const appSubtitle =
    (typeof settings['app.subtitle'] === 'string' && settings['app.subtitle']) ||
    EVIDENS_APP_SUBTITLE;
  const displayTitle = company.name?.trim() || appName;
  const addressLine = buildCompanyAddressLine(company);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (username: string, password: string) => {
    setError('');
    setIsLoading(true);
    try {
      await login(username, password);
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Greška pri prijavi');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell appName={displayTitle} appSubtitle={addressLine || appSubtitle}>
      <LoginForm
        onSubmit={(username, password) => void handleSubmit(username, password)}
        isLoading={isLoading}
        error={error || undefined}
        notice={setupSuccessMessage}
      />
    </AuthShell>
  );
}
