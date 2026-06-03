import { useState } from 'react';
import { Lock, User, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePublicSettings } from '../contexts/public-settings-context';
import { buildCompanyAddressLine, companyHeaderFromSettings } from '../helpers/company-header.util';
import { ApiError } from '../api/client';

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
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white border border-slate-200 rounded-2xl mb-4 shadow-sm">
            <span className="text-blue-600 text-lg font-bold">
              {displayTitle.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{displayTitle}</h1>
          {addressLine ? (
            <p className="text-slate-500 text-sm mt-1">{addressLine}</p>
          ) : (
            <p className="text-slate-500 text-sm mt-1">Sistem za upravljanje opremom</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-6 text-center">Prijava na sistem</h2>

          {setupSuccessMessage && (
            <div className="flex items-start gap-2 text-emerald-700 bg-emerald-50 px-4 py-3 rounded-xl text-sm mb-4">
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
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Unesite lozinku"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-xl text-sm">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

          {import.meta.env.DEV && (
            <div className="mt-6 p-4 bg-blue-50 rounded-xl">
              <div className="flex items-start gap-2">
                <Info size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-800">
                  <p className="font-semibold mb-2">Dev demo podaci:</p>
                  <p>Pokrenite `npm run db:seed:demo` u backend folderu.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
