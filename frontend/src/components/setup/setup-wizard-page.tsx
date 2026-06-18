import { useState } from 'react';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  MapPin,
  Package,
  Shield,
  User,
  Users,
  Warehouse,
} from 'lucide-react';
import { ApiError } from '../../api/client';
import { initializeSetupApi, type InitializeSetupPayload } from '../../api/setup-api';
import { usePublicSettings } from '../../contexts/public-settings-context';
import { AppBrand, EVIDENS_APP_NAME } from '../ui/app-brand';
import { PremiumAuthLayout } from '../ui/premium-auth-layout';
import {
  SETUP_WIZARD_STEP_COUNT,
  canProceedSetupStep,
  createInitialSetupWizardState,
  setupInputClass,
  type SetupWizardState,
} from './setup-wizard-state';
import { SetupRoleAccountForm } from './steps/setup-role-account-form';

interface SetupWizardPageProps {
  onComplete: (message: string) => void;
}

const buildPayload = (state: SetupWizardState): InitializeSetupPayload => {
  const cities = state.cities
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const payload: InitializeSetupPayload = {
    company: {
      name: state.companyName.trim(),
      address: state.companyAddress.trim(),
      city: state.companyCity.trim(),
    },
    location: {
      cantonName: state.cantonName.trim(),
      cities: cities.length > 0 ? cities : [state.companyCity.trim()],
    },
    organization: {},
    warehouse: {
      name: state.warehouseName.trim(),
      address: state.warehouseAddress.trim() || state.companyAddress.trim(),
    },
    category: {
      parentName: state.categoryParentName.trim(),
      leafName: state.categoryLeafName.trim(),
    },
    catalog: {
      name: state.catalogName.trim(),
    },
    admin: {
      firstName: state.adminFirstName.trim(),
      lastName: state.adminLastName.trim(),
      username: state.adminUsername.trim(),
      password: state.adminPassword,
    },
    roles: {
      evidenticar: {
        employee: {
          firstName: state.evidenticar.employee.firstName.trim(),
          lastName: state.evidenticar.employee.lastName.trim(),
          title: state.evidenticar.employee.title.trim(),
        },
        username: state.evidenticar.username.trim(),
        password: state.evidenticar.password,
      },
      skladistar: {
        employee: {
          firstName: state.skladistar.employee.firstName.trim(),
          lastName: state.skladistar.employee.lastName.trim(),
          title: state.skladistar.employee.title.trim(),
        },
        username: state.skladistar.username.trim(),
        password: state.skladistar.password,
      },
      popis_koordinator: {
        employee: {
          firstName: state.popisKoordinator.employee.firstName.trim(),
          lastName: state.popisKoordinator.employee.lastName.trim(),
          title: state.popisKoordinator.employee.title.trim(),
        },
        username: state.popisKoordinator.username.trim(),
        password: state.popisKoordinator.password,
      },
      user: {
        employee: {
          firstName: state.user.employee.firstName.trim(),
          lastName: state.user.employee.lastName.trim(),
          title: state.user.employee.title.trim(),
        },
        username: state.user.username.trim(),
        password: state.user.password,
      },
    },
    director: {
      firstName: state.directorFirstName.trim(),
      lastName: state.directorLastName.trim(),
      title: state.directorTitle.trim(),
    },
  };
  if (state.companyPostalCode.trim()) payload.company.postalCode = state.companyPostalCode.trim();
  if (state.companyPhone.trim()) payload.company.phone = state.companyPhone.trim();
  if (state.companyEmail.trim()) payload.company.email = state.companyEmail.trim();
  if (state.companyTaxId.trim()) payload.company.taxId = state.companyTaxId.trim();
  if (state.adminEmail.trim()) payload.admin.email = state.adminEmail.trim();
  if (state.catalogCode.trim()) payload.catalog.code = state.catalogCode.trim();
  if (state.childUnitName.trim()) {
    payload.organization.childUnitName = state.childUnitName.trim();
    payload.organization.childUnitType = state.childUnitType;
  }
  if (state.setupToken.trim()) payload.setupToken = state.setupToken.trim();
  return payload;
};

export const SetupWizardPage = ({ onComplete }: SetupWizardPageProps) => {
  const { refresh: refreshSettings } = usePublicSettings();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<SetupWizardState>(createInitialSetupWizardState);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const appName = (import.meta.env.VITE_APP_NAME as string) || EVIDENS_APP_NAME;

  const patch = (partial: Partial<SetupWizardState>) => setState((prev) => ({ ...prev, ...partial }));

  const handleSubmit = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const response = await initializeSetupApi(buildPayload(state));
      await refreshSettings();
      const userList = response.usernames.map((u) => `@${u}`).join(', ');
      onComplete(`Instalacija završena. Kreirani korisnici: ${userList}. Prijavite se administratorskim računom.`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri inicijalizaciji';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompanyCityBlur = () => {
    if (!state.cantonName.trim() && state.companyCity.trim()) {
      patch({ cantonName: `Kanton ${state.companyCity.trim()}` });
    }
    if (!state.cities.trim() && state.companyCity.trim()) {
      patch({ cities: state.companyCity.trim() });
    }
    if (!state.warehouseAddress.trim() && state.companyAddress.trim()) {
      patch({ warehouseAddress: state.companyAddress.trim() });
    }
  };

  const handleAdminStepNext = () => {
    patch({
      directorFirstName: state.directorFirstName || state.adminFirstName,
      directorLastName: state.directorLastName || state.adminLastName,
    });
    setStep((s) => s + 1);
  };

  return (
    <PremiumAuthLayout maxWidth="lg">
      <div className="mb-6">
        <AppBrand name={appName} subtitle={`Inicijalizacija · korak ${step} od ${SETUP_WIZARD_STEP_COUNT}`} />
      </div>

      <form
        className="w-full bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-950/40"
        onSubmit={(event) => {
          event.preventDefault();
          if (step < SETUP_WIZARD_STEP_COUNT) {
            if (!canProceedSetupStep(step, state)) return;
            if (step === 6) {
              handleAdminStepNext();
              return;
            }
            setStep((s) => s + 1);
            return;
          }
          void handleSubmit();
        }}
      >
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex gap-1">
            {Array.from({ length: SETUP_WIZARD_STEP_COUNT }, (_, i) => i + 1).map((n) => (
              <div
                key={n}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  n <= step ? 'bg-teal-600' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {step === 1 && (
            <>
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <Building2 size={18} className="text-teal-600" />
                Podaci o preduzeću
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Naziv *
                <input value={state.companyName} onChange={(e) => patch({ companyName: e.target.value })} onBlur={handleCompanyCityBlur} className={setupInputClass} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Adresa *
                <input value={state.companyAddress} onChange={(e) => patch({ companyAddress: e.target.value })} onBlur={handleCompanyCityBlur} className={setupInputClass} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Grad *
                <input value={state.companyCity} onChange={(e) => patch({ companyCity: e.target.value })} onBlur={handleCompanyCityBlur} className={setupInputClass} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  Poštanski broj
                  <input value={state.companyPostalCode} onChange={(e) => patch({ companyPostalCode: e.target.value })} className={setupInputClass} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Telefon
                  <input value={state.companyPhone} onChange={(e) => patch({ companyPhone: e.target.value })} className={setupInputClass} />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input type="email" value={state.companyEmail} onChange={(e) => patch({ companyEmail: e.target.value })} className={setupInputClass} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                JIB / ID
                <input value={state.companyTaxId} onChange={(e) => patch({ companyTaxId: e.target.value })} className={setupInputClass} />
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <MapPin size={18} className="text-teal-600" />
                Lokacije
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Kanton *
                <input value={state.cantonName} onChange={(e) => patch({ cantonName: e.target.value })} className={setupInputClass} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Gradovi * (odvojeni zarezom)
                <input value={state.cities} onChange={(e) => patch({ cities: e.target.value })} placeholder="Sarajevo, Zenica" className={setupInputClass} />
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <FolderTree size={18} className="text-teal-600" />
                Organizacija
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p className="text-slate-500">Direkcija (vrh hijerarhije)</p>
                <p className="font-medium text-slate-900">{state.companyName || '—'}</p>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Opcionalna podjedinica
                <input value={state.childUnitName} onChange={(e) => patch({ childUnitName: e.target.value })} placeholder="npr. Distribucija Sarajevo" className={setupInputClass} />
              </label>
              {state.childUnitName.trim() ? (
                <label className="block text-sm font-medium text-slate-700">
                  Tip podjedinice
                  <select value={state.childUnitType} onChange={(e) => patch({ childUnitType: e.target.value })} className={setupInputClass}>
                    <option value="distribucija">Distribucija</option>
                    <option value="sektor">Sektor</option>
                    <option value="sluzba">Služba</option>
                    <option value="podrucje">Područje</option>
                  </select>
                </label>
              ) : null}
            </>
          )}

          {step === 4 && (
            <>
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <Warehouse size={18} className="text-teal-600" />
                Skladište
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Naziv skladišta *
                <input value={state.warehouseName} onChange={(e) => patch({ warehouseName: e.target.value })} className={setupInputClass} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Adresa
                <input value={state.warehouseAddress} onChange={(e) => patch({ warehouseAddress: e.target.value })} className={setupInputClass} />
              </label>
            </>
          )}

          {step === 5 && (
            <>
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <Package size={18} className="text-teal-600" />
                Kategorija i šifrarnik
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Roditeljska kategorija *
                <input value={state.categoryParentName} onChange={(e) => patch({ categoryParentName: e.target.value })} className={setupInputClass} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Podkategorija (leaf) *
                <input value={state.categoryLeafName} onChange={(e) => patch({ categoryLeafName: e.target.value })} className={setupInputClass} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Naziv stavke šifrarnika *
                <input value={state.catalogName} onChange={(e) => patch({ catalogName: e.target.value })} className={setupInputClass} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Šifra šifrarnika
                <input value={state.catalogCode} onChange={(e) => patch({ catalogCode: e.target.value })} className={setupInputClass} />
              </label>
            </>
          )}

          {step === 6 && (
            <>
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <User size={18} className="text-teal-600" />
                Administrator
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  Ime *
                  <input value={state.adminFirstName} onChange={(e) => patch({ adminFirstName: e.target.value })} className={setupInputClass} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Prezime *
                  <input value={state.adminLastName} onChange={(e) => patch({ adminLastName: e.target.value })} className={setupInputClass} />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input type="email" value={state.adminEmail} onChange={(e) => patch({ adminEmail: e.target.value })} className={setupInputClass} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Korisničko ime *
                <input value={state.adminUsername} onChange={(e) => patch({ adminUsername: e.target.value })} className={setupInputClass} autoComplete="username" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  Lozinka *
                  <input type="password" value={state.adminPassword} onChange={(e) => patch({ adminPassword: e.target.value })} className={setupInputClass} autoComplete="new-password" />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Potvrda *
                  <input type="password" value={state.adminPasswordConfirm} onChange={(e) => patch({ adminPasswordConfirm: e.target.value })} className={setupInputClass} autoComplete="new-password" />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Setup token (ako je konfigurisan)
                <input value={state.setupToken} onChange={(e) => patch({ setupToken: e.target.value })} className={setupInputClass} />
              </label>
            </>
          )}

          {step === 7 && (
            <>
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <Users size={18} className="text-teal-600" />
                Tim po ulogama
              </div>
              <SetupRoleAccountForm title="Evidentičar" account={state.evidenticar} onChange={(evidenticar) => patch({ evidenticar })} />
              <SetupRoleAccountForm title="Skladištar" account={state.skladistar} onChange={(skladistar) => patch({ skladistar })} />
              <SetupRoleAccountForm title="Koordinator popisa" account={state.popisKoordinator} onChange={(popisKoordinator) => patch({ popisKoordinator })} />
              <SetupRoleAccountForm title="Korisnik" account={state.user} onChange={(user) => patch({ user })} />
            </>
          )}

          {step === 8 && (
            <>
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <Shield size={18} className="text-teal-600" />
                Direktor (potpis prenosnica)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  Ime *
                  <input value={state.directorFirstName} onChange={(e) => patch({ directorFirstName: e.target.value })} className={setupInputClass} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Prezime *
                  <input value={state.directorLastName} onChange={(e) => patch({ directorLastName: e.target.value })} className={setupInputClass} />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Titula *
                <input value={state.directorTitle} onChange={(e) => patch({ directorTitle: e.target.value })} className={setupInputClass} />
              </label>
            </>
          )}

          {step === 9 && (
            <>
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <Shield size={18} className="text-teal-600" />
                Pregled instalacije
              </div>
              <dl className="text-sm space-y-3 bg-slate-50 rounded-xl p-4">
                <div>
                  <dt className="text-slate-500">Preduzeće</dt>
                  <dd className="font-medium">{state.companyName}</dd>
                  <dd className="text-slate-600">{state.companyAddress}, {state.companyCity}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Lokacije</dt>
                  <dd>{state.cantonName} · {state.cities}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Skladište / kategorija</dt>
                  <dd>{state.warehouseName} · {state.categoryParentName} → {state.categoryLeafName}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Korisnici</dt>
                  <dd>@{state.adminUsername}, @{state.evidenticar.username}, @{state.skladistar.username}, @{state.popisKoordinator.username}, @{state.user.username}</dd>
                </div>
              </dl>
            </>
          )}

          {error ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">{error}</p>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-between gap-2">
          {step > 1 ? (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="inline-flex items-center gap-1 px-4 py-2 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50">
              <ChevronLeft size={16} /> Nazad
            </button>
          ) : (
            <span />
          )}
          {step < SETUP_WIZARD_STEP_COUNT ? (
            <button
              type="submit"
              disabled={!canProceedSetupStep(step, state)}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-teal-600 text-white rounded-xl disabled:opacity-50 hover:bg-teal-500"
            >
              Dalje <ChevronRight size={16} />
            </button>
          ) : (
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm bg-teal-600 text-white rounded-xl disabled:opacity-50 hover:bg-teal-500">
              {isSubmitting ? 'Inicijalizacija...' : 'Završi instalaciju'}
            </button>
          )}
        </div>
      </form>
    </PremiumAuthLayout>
  );
};
