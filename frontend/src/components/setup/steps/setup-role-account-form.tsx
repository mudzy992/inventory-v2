import type { SetupRoleAccountFields } from '../setup-wizard-state';
import { setupInputClass } from '../setup-wizard-state';

interface RoleAccountFormProps {
  title: string;
  account: SetupRoleAccountFields;
  onChange: (account: SetupRoleAccountFields) => void;
}

export const SetupRoleAccountForm = ({ title, account, onChange }: RoleAccountFormProps) => (
  <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
    <p className="font-medium text-slate-800">{title}</p>
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
      Korisničko ime *
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
