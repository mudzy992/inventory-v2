import { useState } from 'react';
import { Lock, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePublicSettings } from '../contexts/public-settings-context';
import { buildCompanyAddressLine, companyHeaderFromSettings } from '../helpers/company-header.util';
import { ApiError } from '../api/client';
import { PremiumAuthLayout } from './ui/premium-auth-layout';

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
    'Inventar';
  const displayTitle = company.name?.trim() || appName;
  const addressLine = buildCompanyAddressLine(company);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(username, password);
      onLoginSuccess();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri prijavi';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PremiumAuthLayout>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 border border-white/20 rounded-2xl mb-4 shadow-lg shadow-blue-900/30 backdrop-blur-md">
          <span className="text-white text-xl font-bold tracking-tight">
            {displayTitle.slice(0, 2).toUpperCase()}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">{displayTitle}</h1>
        {addressLine ? (
          <p className="text-blue-200/80 text-sm mt-2 max-w-xs mx-auto">{addressLine}</p>
        ) : (
          <p className="text-blue-200/80 text-sm mt-2">Sistem za upravljanje opremom</p>
        )}
      </div>

      <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl shadow-slate-950/50 p-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-6 text-center">Prijava na sistem</h2>

        {setupSuccessMessage && (
          <div className="flex items-start gap-2 text-emerald-700 bg-emerald-50 px-4 py-3 rounded-xl text-sm mb-4 border border-emerald-100">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>{setupSuccessMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Korisničko ime</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                placeholder="Unesite korisničko ime"
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Lozinka</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                placeholder="Unesite lozinku"
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-xl text-sm border border-red-100">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !username || !password}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Prijava...
              </>
            ) : (
              'Prijavi se'
            )}
          </button>
        </form>
      </div>
    </PremiumAuthLayout>
  );
}
