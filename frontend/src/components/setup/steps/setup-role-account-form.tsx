import type { LucideIcon } from 'lucide-react';
import { ClipboardList, Shield, User, UserCircle, Warehouse } from 'lucide-react';
import type { SetupRoleAccountFields } from '../setup-wizard-state';
import { setupInputClass } from '../setup-wizard-state';

type RoleVariant = 'evidenticar' | 'skladistar' | 'koordinator' | 'user';

const ROLE_META: Record<
  RoleVariant,
  { title: string; icon: LucideIcon; accent: string; description: string }
> = {
  evidenticar: {
    title: 'Evidentičar',
    icon: Shield,
    accent: 'bg-purple-50 text-purple-600 border-purple-100',
    description: 'Zaduženja, prenosi i evidencija u dodijeljenom opsegu.',
  },
  skladistar: {
    title: 'Skladištar',
    icon: Warehouse,
    accent: 'bg-teal-50 text-teal-600 border-teal-100',
    description: 'Prijem lotova i upravljanje skladištem.',
  },
  koordinator: {
    title: 'Koordinator popisa',
    icon: ClipboardList,
    accent: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    description: 'Vođenje sesija popisa i koordinacija na terenu.',
  },
  user: {
    title: 'Korisnik',
    icon: UserCircle,
    accent: 'bg-slate-100 text-slate-600 border-slate-200',
    description: 'Pregled vlastite zadužene opreme.',
  },
};

interface SetupRoleAccountFormProps {
  variant: RoleVariant;
  account: SetupRoleAccountFields;
  onChange: (account: SetupRoleAccountFields) => void;
}

export const SetupRoleAccountForm = ({ variant, account, onChange }: SetupRoleAccountFormProps) => {
  const meta = ROLE_META[variant];
  const Icon = meta.icon;

  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-white shadow-sm hover:border-teal-200/50 transition-colors duration-300">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${meta.accent}`} aria-hidden>
          <Icon size={18} strokeWidth={2} />
        </div>
        <div>
          <p className="font-medium text-slate-800">{meta.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-slate-700">
          Ime radnika *
          <input
            value={account.employee.firstName}
            onChange={(e) =>
              onChange({ ...account, employee: { ...account.employee, firstName: e.target.value } })
            }
            className={setupInputClass}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Prezime *
          <input
            value={account.employee.lastName}
            onChange={(e) =>
              onChange({ ...account, employee: { ...account.employee, lastName: e.target.value } })
            }
            className={setupInputClass}
          />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Titula *
        <input
          value={account.employee.title}
          onChange={(e) =>
            onChange({ ...account, employee: { ...account.employee, title: e.target.value } })
          }
          className={setupInputClass}
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        <span className="inline-flex items-center gap-1.5">
          <User size={14} className="text-slate-400" aria-hidden />
          Korisničko ime *
        </span>
        <input
          value={account.username}
          onChange={(e) => onChange({ ...account, username: e.target.value })}
          className={setupInputClass}
          autoComplete="off"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-slate-700">
          Lozinka * (min. 8)
          <input
            type="password"
            value={account.password}
            onChange={(e) => onChange({ ...account, password: e.target.value })}
            className={setupInputClass}
            autoComplete="new-password"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Potvrda *
          <input
            type="password"
            value={account.passwordConfirm}
            onChange={(e) => onChange({ ...account, passwordConfirm: e.target.value })}
            className={setupInputClass}
            autoComplete="new-password"
          />
        </label>
      </div>
    </div>
  );
};
