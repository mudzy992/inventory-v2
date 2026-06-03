import { useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, Shield, Sparkles, User } from 'lucide-react';
import { ApiError } from '../../api/client';
import { initializeSetupApi, type InitializeSetupPayload } from '../../api/setup-api';
import { usePublicSettings } from '../../contexts/public-settings-context';
import { PremiumAuthLayout } from '../ui/premium-auth-layout';

interface SetupWizardPageProps {
  onComplete: () => void;
}

type WizardStep = 1 | 2 | 3;

export const SetupWizardPage = ({ onComplete }: SetupWizardPageProps) => {
  const { refresh: refreshSettings } = usePublicSettings();
  const [step, setStep] = useState<WizardStep>(1);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [companyPostalCode, setCompanyPostalCode] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyTaxId, setCompanyTaxId] = useState('');
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [setupToken, setSetupToken] = useState('');

  const canProceedStep1 = companyName.trim() && companyAddress.trim() && companyCity.trim();
  const canProceedStep2 =
    adminFirstName.trim() &&
    adminLastName.trim() &&
    adminUsername.trim().length >= 3 &&
    adminPassword.length >= 8 &&
    adminPassword === adminPasswordConfirm;

  const handleSubmit = async () => {
    setError('');
    if (adminPassword !== adminPasswordConfirm) {
      setError('Lozinke se ne poklapaju.');
      return;
    }
    setIsSubmitting(true);
    const payload: InitializeSetupPayload = {
      companyName: companyName.trim(),
      companyAddress: companyAddress.trim(),
      companyCity: companyCity.trim(),
      adminFirstName: adminFirstName.trim(),
      adminLastName: adminLastName.trim(),
      adminUsername: adminUsername.trim(),
      adminPassword,
    };
    if (companyPostalCode.trim()) payload.companyPostalCode = companyPostalCode.trim();
    if (companyPhone.trim()) payload.companyPhone = companyPhone.trim();
    if (companyEmail.trim()) payload.companyEmail = companyEmail.trim();
    if (companyTaxId.trim()) payload.companyTaxId = companyTaxId.trim();
    if (adminEmail.trim()) payload.adminEmail = adminEmail.trim();
    if (setupToken.trim()) payload.setupToken = setupToken.trim();
    try {
      await initializeSetupApi(payload);
      await refreshSettings();
      onComplete();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri inicijalizaciji';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const appName = (import.meta.env.VITE_APP_NAME as string) || 'Inventar';

  return (
    <PremiumAuthLayout maxWidth="lg">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 border border-white/20 rounded-2xl mb-4 shadow-lg shadow-blue-900/30 backdrop-blur-md">
          <Sparkles size={28} className="text-blue-200" aria-hidden />
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
          Inicijalizacija aplikacije
        </h1>
        <p className="text-blue-200/80 text-sm mt-2">
          {appName} · Korak {step} od 3
        </p>
      </div>

      <form
        className="w-full bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-950/40"
        onSubmit={(event) => {
          event.preventDefault();
          if (step < 3) {
            if ((step === 1 && canProceedStep1) || (step === 2 && canProceedStep2)) {
              setStep((s) => (s + 1) as WizardStep);
            }
            return;
          }
          void handleSubmit();
        }}
      >
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex gap-2">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  n <= step ? 'bg-blue-600' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>
        <div className="p-6 space-y-4">
          {step === 1 && (
            <>
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <Building2 size={18} className="text-blue-600" />
                Podaci o preduzeću
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Naziv *
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Adresa *
                <input
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Grad *
                <input
                  value={companyCity}
                  onChange={(e) => setCompanyCity(e.target.value)}
                  className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  Poštanski broj
                  <input
                    value={companyPostalCode}
                    onChange={(e) => setCompanyPostalCode(e.target.value)}
                    className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Telefon
                  <input
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                  className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                JIB / ID
                <input
                  value={companyTaxId}
                  onChange={(e) => setCompanyTaxId(e.target.value)}
                  className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </label>
            </>
          )}
          {step === 2 && (
            <>
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <User size={18} className="text-blue-600" />
                Administrator
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  Ime *
                  <input
                    value={adminFirstName}
                    onChange={(e) => setAdminFirstName(e.target.value)}
                    className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Prezime *
                  <input
                    value={adminLastName}
                    onChange={(e) => setAdminLastName(e.target.value)}
                    className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Korisničko ime *
                <input
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  autoComplete="username"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Lozinka * (min. 8)
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  autoComplete="new-password"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Potvrda lozinke *
                <input
                  type="password"
                  value={adminPasswordConfirm}
                  onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                  className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  autoComplete="new-password"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Setup token (ako je konfigurisan na serveru)
                <input
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  className="mt-1 block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </label>
            </>
          )}
          {step === 3 && (
            <>
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <Shield size={18} className="text-blue-600" />
                Pregled
              </div>
              <dl className="text-sm space-y-2 bg-slate-50 rounded-xl p-4">
                <div>
                  <dt className="text-slate-500">Preduzeće</dt>
                  <dd className="font-medium text-slate-900">{companyName}</dd>
                  <dd className="text-slate-600">
                    {companyAddress}, {companyCity}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Administrator</dt>
                  <dd className="font-medium text-slate-900">
                    {adminFirstName} {adminLastName}
                  </dd>
                  <dd className="text-slate-600">@{adminUsername}</dd>
                </div>
              </dl>
            </>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">
              {error}
            </p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-between gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as WizardStep)}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft size={16} /> Nazad
              </button>
            ) : (
              <span />
            )}
            {step < 3 ? (
              <button
                type="submit"
                disabled={(step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2)}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-xl disabled:opacity-50 hover:bg-blue-500 transition-colors shadow-md shadow-blue-600/20"
              >
                Dalje <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting || !canProceedStep2}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl disabled:opacity-50 hover:bg-blue-500 transition-colors shadow-md shadow-blue-600/20"
              >
                {isSubmitting ? 'Inicijalizacija...' : 'Završi instalaciju'}
              </button>
            )}
        </div>
      </form>
    </PremiumAuthLayout>
  );
};
