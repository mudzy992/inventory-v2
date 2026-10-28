import { useId, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, User } from 'lucide-react';
import { inputClass, labelClass } from './ui/form-styles';
import { Button } from './ui/button';

export interface LoginFormProps {
  onSubmit: (username: string, password: string) => void;
  isLoading?: boolean;
  error?: string;
  notice?: string;
}

/**
 * Presentational login form (F-4/F-6): every control has a real label,
 * `aria-invalid` + `aria-describedby` for the error, and a password visibility
 * toggle that is itself keyboard reachable. No context dependencies, so it is
 * directly unit-testable.
 */
export const LoginForm = ({ onSubmit, isLoading = false, error, notice }: LoginFormProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const usernameId = useId();
  const passwordId = useId();
  const errorId = useId();
  const noticeId = useId();

  const canSubmit = username.trim().length > 0 && password.length > 0 && !isLoading;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit(username.trim(), password);
  };

  return (
    <div className="ds-auth-card p-7 sm:p-8">
      <div className="mb-7">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Prijava na sistem</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Unesite korisničke podatke za pristup evidenciji.
        </p>
      </div>

      {notice ? (
        <div
          id={noticeId}
          className="mb-5 flex items-start gap-2 rounded-[var(--radius-control)] border border-success-ink/20 bg-success-soft px-3.5 py-3 text-sm text-success-ink"
          role="status"
        >
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor={usernameId} className={labelClass}>
            Korisničko ime
          </label>
          <div className="relative">
            <User
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <input
              id={usernameId}
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={`${inputClass} pl-10`}
              placeholder="npr. ime.prezime"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-describedby={error ? errorId : undefined}
            />
          </div>
        </div>

        <div>
          <label htmlFor={passwordId} className={labelClass}>
            Lozinka
          </label>
          <div className="relative">
            <Lock
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <input
              id={passwordId}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${inputClass} pl-10 pr-11`}
              placeholder="Unesite lozinku"
              autoComplete="current-password"
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[var(--radius-control)] p-2 text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
              aria-label={showPassword ? 'Sakrij lozinku' : 'Prikaži lozinku'}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff size={16} aria-hidden="true" />
              ) : (
                <Eye size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {error ? (
          <div
            id={errorId}
            className="flex items-center gap-2 rounded-[var(--radius-control)] border border-danger-ink/20 bg-danger-soft px-3.5 py-3 text-sm text-danger-ink"
            role="alert"
            aria-live="assertive"
          >
            <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <Button type="submit" size="lg" loading={isLoading} disabled={!canSubmit} className="w-full">
          {isLoading ? 'Prijava…' : 'Prijavi se'}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-subtle">
        Pristup je moguć samo korisnicima sa dodijeljenim nalogom.
      </p>
    </div>
  );
};
