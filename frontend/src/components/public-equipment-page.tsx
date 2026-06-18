import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Building2,
  ClipboardList,
  History,
  Package,
  QrCode,
  User,
  Warehouse,
} from 'lucide-react';
import { ApiError } from '../api/client';
import { fetchPublicEquipmentApi, type PublicEquipmentDto } from '../api/public-equipment-api';
import { usePublicSettings } from '../contexts/public-settings-context';
import { buildCompanyAddressLine, companyHeaderFromSettings } from '../helpers/company-header.util';
import { formatDate, getStatusColor, getStatusLabel } from '../helpers';
import { getEquipmentPrimaryLabel } from '../helpers/equipment-accounting-tracked.util';
import { SegmentTabs } from './ui/segment-tabs';

interface PublicEquipmentPageProps {
  equipmentId: string;
}

type DetailTab = 'holder' | 'specs' | 'history';

type EquipmentStatusKey = 'zaduzeno' | 'skladiste' | 'za_rashod' | 'rashodovano';

interface StatusTheme {
  heroGradient: string;
  pageGradient: string;
  pageGlowTop: string;
  pageGlowBottom: string;
  pageOrb: string;
  headerAccent: string;
  spinnerBorder: string;
  tabRing: string;
}

const statusThemes: Record<EquipmentStatusKey | 'default', StatusTheme> = {
  zaduzeno: {
    heroGradient: 'from-emerald-600 to-teal-600',
    pageGradient: 'from-emerald-200/90 via-teal-100/70 to-emerald-50/40',
    pageGlowTop: 'rgba(16, 185, 129, 0.45)',
    pageGlowBottom: 'rgba(20, 184, 166, 0.28)',
    pageOrb: 'bg-emerald-400/25',
    headerAccent: 'text-emerald-950',
    spinnerBorder: 'border-emerald-600',
    tabRing: 'ring-emerald-200/80',
  },
  skladiste: {
    heroGradient: 'from-blue-600 to-indigo-600',
    pageGradient: 'from-blue-200/90 via-indigo-100/70 to-blue-50/40',
    pageGlowTop: 'rgba(59, 130, 246, 0.45)',
    pageGlowBottom: 'rgba(99, 102, 241, 0.28)',
    pageOrb: 'bg-blue-400/25',
    headerAccent: 'text-blue-950',
    spinnerBorder: 'border-blue-600',
    tabRing: 'ring-blue-200/80',
  },
  za_rashod: {
    heroGradient: 'from-orange-600 to-amber-600',
    pageGradient: 'from-orange-200/80 via-amber-100/60 to-orange-50/35',
    pageGlowTop: 'rgba(234, 88, 12, 0.38)',
    pageGlowBottom: 'rgba(245, 158, 11, 0.22)',
    pageOrb: 'bg-orange-400/20',
    headerAccent: 'text-orange-950',
    spinnerBorder: 'border-orange-600',
    tabRing: 'ring-orange-200/80',
  },
  rashodovano: {
    heroGradient: 'from-red-600 to-rose-600',
    pageGradient: 'from-red-200/80 via-rose-100/60 to-red-50/35',
    pageGlowTop: 'rgba(220, 38, 38, 0.38)',
    pageGlowBottom: 'rgba(244, 63, 94, 0.22)',
    pageOrb: 'bg-red-400/20',
    headerAccent: 'text-red-950',
    spinnerBorder: 'border-red-600',
    tabRing: 'ring-red-200/80',
  },
  default: {
    heroGradient: 'from-slate-700 to-slate-900',
    pageGradient: 'from-slate-200/80 via-slate-100/70 to-slate-50/40',
    pageGlowTop: 'rgba(59, 130, 246, 0.25)',
    pageGlowBottom: 'rgba(99, 102, 241, 0.15)',
    pageOrb: 'bg-slate-400/15',
    headerAccent: 'text-slate-900',
    spinnerBorder: 'border-blue-600',
    tabRing: 'ring-slate-200/80',
  },
};

function resolveStatusTheme(status?: string): StatusTheme {
  if (
    status === 'zaduzeno' ||
    status === 'skladiste' ||
    status === 'za_rashod' ||
    status === 'rashodovano'
  ) {
    return statusThemes[status];
  }
  return statusThemes.default;
}

export const PublicEquipmentPage = ({ equipmentId }: PublicEquipmentPageProps) => {
  const { settings, getBoolean } = usePublicSettings();
  const lookupEnabled = getBoolean('features.public_equipment_lookup', true);
  const [equipment, setEquipment] = useState<PublicEquipmentDto | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('holder');
  const company = companyHeaderFromSettings(settings);

  useEffect(() => {
    document.body.classList.add('auth-flow');
    return () => {
      document.body.classList.remove('auth-flow');
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchPublicEquipmentApi(equipmentId);
        setEquipment(data);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Oprema nije pronađena';
        setError(message);
        setEquipment(null);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [equipmentId, lookupEnabled]);

  if (!lookupEnabled) {
    return (
      <PublicPageShell company={company} statusTheme={statusThemes.default}>
        <MessageCard tone="muted">
          Javni pregled opreme putem QR linka trenutno nije omogućen.
        </MessageCard>
      </PublicPageShell>
    );
  }

  const statusTheme = resolveStatusTheme(equipment?.status);

  return (
    <PublicPageShell company={company} statusTheme={statusTheme}>
      {isLoading && (
        <div className="rounded-2xl border border-white/60 bg-white/80 p-8 text-center shadow-sm backdrop-blur-md">
          <div
            className={`mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent ${statusTheme.spinnerBorder}`}
          />
          <p className="text-sm text-slate-600">Učitavanje opreme...</p>
        </div>
      )}

      {error && !isLoading && <MessageCard tone="error">{error}</MessageCard>}

      {equipment && !isLoading && (
        <div className="space-y-4 pb-6">
          <EquipmentSummaryCard equipment={equipment} theme={statusTheme} />

          <section
            className={`overflow-hidden rounded-2xl border border-white/70 bg-white/85 shadow-lg shadow-black/5 ring-1 backdrop-blur-md ${statusTheme.tabRing}`}
          >
            <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
              <SegmentTabs
                tabs={[
                  { id: 'holder', label: 'Zaduženje', icon: User },
                  { id: 'specs', label: 'Specifikacije', icon: ClipboardList },
                  { id: 'history', label: 'Historija', icon: History },
                ]}
                activeTab={activeTab}
                onChange={setActiveTab}
              />
            </div>

            <div className="p-4 sm:p-5" role="tabpanel">
              {activeTab === 'holder' && <AssignmentPanel equipment={equipment} />}
              {activeTab === 'specs' && <SpecificationsPanel equipment={equipment} />}
              {activeTab === 'history' && <HistoryPanel equipment={equipment} />}
            </div>
          </section>

          <p className="text-center text-xs text-slate-600/70">Samo pregled — bez akcija</p>
        </div>
      )}
    </PublicPageShell>
  );
};

function EquipmentSummaryCard({
  equipment,
  theme,
}: {
  equipment: PublicEquipmentDto;
  theme: StatusTheme;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl bg-gradient-to-br ${theme.heroGradient} text-white shadow-xl shadow-black/10`}
    >
      <div className="px-5 py-5 sm:px-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <Package size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">
              {equipment.categoryName}
            </p>
            <h1 className="mt-1 text-xl font-semibold leading-snug sm:text-2xl">
              {equipment.productName ?? '—'}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-white/15 px-2.5 py-1 font-mono text-sm text-white/95 backdrop-blur-sm">
                {getEquipmentPrimaryLabel(equipment)}
              </span>
              {!equipment.isAccountingTracked ? (
                <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
                  Evidencijska
                </span>
              ) : null}
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
                {getStatusLabel(equipment.status)}
              </span>
            </div>
          </div>
        </div>

        {equipment.uniqueFields.length > 0 && (
          <div className="mt-4 space-y-2">
            {equipment.uniqueFields.map((field) => (
              <div
                key={field.label}
                className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm"
              >
                <p className="text-xs text-white/70">{field.label}</p>
                <p className="mt-0.5 text-sm font-semibold">{field.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AssignmentPanel({ equipment }: { equipment: PublicEquipmentDto }) {
  if (equipment.status === 'zaduzeno' && equipment.currentHolder) {
    return (
      <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">
          <User size={14} />
          Trenutno zadužen na
        </h2>
        <p className="text-lg font-semibold text-emerald-950">{equipment.currentHolder.fullName}</p>
        <p className="mt-0.5 text-sm text-emerald-800">{equipment.currentHolder.title}</p>
        {equipment.currentHolder.orgUnitPath && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-emerald-700">
            <Building2 size={12} className="mt-0.5 shrink-0" />
            <span>{equipment.currentHolder.orgUnitPath}</span>
          </p>
        )}
      </div>
    );
  }

  if (equipment.status === 'skladiste') {
    return (
      <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-4 sm:p-5">
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-800">
          <Warehouse size={14} />
          Lokacija
        </h2>
        <p className="text-lg font-semibold text-blue-950">
          {equipment.warehouse?.name ?? 'Na skladištu'}
        </p>
        <p className="mt-0.5 text-sm text-blue-700">Oprema je dostupna za zaduženje</p>
      </div>
    );
  }

  if (equipment.status === 'za_rashod') {
    return (
      <div className="rounded-xl border border-orange-200/80 bg-orange-50/70 p-4 sm:p-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-800">Status</h2>
        <p className="text-lg font-semibold text-orange-950">Na listi za rashod</p>
        <p className="mt-0.5 text-sm text-orange-700">Oprema čeka odluku komisije za rashod</p>
        {equipment.disposalReason && (
          <p className="mt-3 rounded-lg bg-orange-100/80 px-3 py-2 text-sm text-orange-900">
            <span className="font-medium">Razlog: </span>
            {equipment.disposalReason}
          </p>
        )}
      </div>
    );
  }

  if (equipment.status === 'rashodovano') {
    return (
      <div className="rounded-xl border border-red-200/80 bg-red-50/70 p-4 sm:p-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-800">Status</h2>
        <p className="text-lg font-semibold text-red-950">Rashodovano</p>
        <p className="mt-0.5 text-sm text-red-700">Oprema više nije u aktivnom inventaru</p>
        {equipment.disposalReason && (
          <p className="mt-3 rounded-lg bg-red-100/80 px-3 py-2 text-sm text-red-900">
            <span className="font-medium">Razlog: </span>
            {equipment.disposalReason}
          </p>
        )}
      </div>
    );
  }

  return <EmptyTabMessage>Nema podataka o zaduženju</EmptyTabMessage>;
}

function SpecificationsPanel({ equipment }: { equipment: PublicEquipmentDto }) {
  const entries = Object.entries(equipment.specifications);
  if (entries.length === 0) {
    return <EmptyTabMessage>Nema dodatnih specifikacija</EmptyTabMessage>;
  }

  return (
    <dl className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50">
      {entries.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 px-4 py-3 first:rounded-t-xl last:rounded-b-xl">
          <dt className="text-sm text-slate-500">{label}</dt>
          <dd className="text-right text-sm font-medium text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function HistoryPanel({ equipment }: { equipment: PublicEquipmentDto }) {
  if (equipment.movements.length === 0) {
    return <EmptyTabMessage>Nema zabilježenih kretanja</EmptyTabMessage>;
  }

  return (
    <ol className="space-y-3">
      {equipment.movements.map((movement, index) => (
        <li
          key={`${movement.documentNumber}-${movement.date}-${index}`}
          className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800">
              {getStatusLabel(movement.type)}
            </span>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusColor(movement.status)}`}>
                {movement.status === 'raw' ? 'RAW' : getStatusLabel(movement.status)}
              </span>
              <span className="text-xs text-slate-400">{formatDate(movement.date)}</span>
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-slate-600">
            <span className="truncate">{movement.fromLabel}</span>
            <ArrowRight size={14} className="shrink-0 text-slate-400" />
            <span className="truncate">{movement.toLabel}</span>
          </p>
          <p className="mt-1.5 font-mono text-[11px] text-slate-400">{movement.documentNumber}</p>
        </li>
      ))}
    </ol>
  );
}

function EmptyTabMessage({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-sm text-slate-400">
      {children}
    </p>
  );
}

function PublicPageShell({
  company,
  statusTheme,
  children,
}: {
  company: ReturnType<typeof companyHeaderFromSettings>;
  statusTheme: StatusTheme;
  children: ReactNode;
}) {
  const companyLine = buildCompanyAddressLine(company);

  return (
    <div className="relative min-h-[100dvh] w-full py-6 sm:py-8">
      <div
        className={`fixed inset-0 -z-10 bg-gradient-to-b transition-colors duration-700 ${statusTheme.pageGradient}`}
        aria-hidden
      />
      <div
        className="fixed inset-0 -z-10 transition-opacity duration-700"
        style={{
          background: `radial-gradient(ellipse 85% 55% at 50% -8%, ${statusTheme.pageGlowTop}, transparent)`,
        }}
        aria-hidden
      />
      <div
        className="fixed inset-0 -z-10 transition-opacity duration-700"
        style={{
          background: `radial-gradient(ellipse 75% 50% at 100% 100%, ${statusTheme.pageGlowBottom}, transparent)`,
        }}
        aria-hidden
      />
      <div
        className={`fixed -top-24 -left-24 -z-10 h-72 w-72 rounded-full blur-3xl transition-colors duration-700 ${statusTheme.pageOrb}`}
        aria-hidden
      />
      <div
        className={`fixed -bottom-32 -right-16 -z-10 h-80 w-80 rounded-full blur-3xl transition-colors duration-700 ${statusTheme.pageOrb}`}
        aria-hidden
      />
      <div className="mx-auto w-full max-w-lg px-4 sm:px-6">
        <header className="mb-5 text-center">
          {company.name ? (
            <>
              <p className={`text-sm font-semibold ${statusTheme.headerAccent}`}>{company.name}</p>
              {companyLine && <p className="mt-1 text-xs text-slate-600/80">{companyLine}</p>}
            </>
          ) : (
            <p className={`flex items-center justify-center gap-2 text-sm font-semibold ${statusTheme.headerAccent}`}>
              <QrCode size={16} />
              Inventar
            </p>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

function MessageCard({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'error' | 'muted';
}) {
  const toneClass =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-slate-200 bg-white/95 text-slate-600';
  return (
    <div className={`rounded-2xl border p-6 text-center text-sm shadow-sm backdrop-blur-sm ${toneClass}`}>
      {children}
    </div>
  );
}
