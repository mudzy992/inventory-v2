import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, ChevronDown, LogOut, Shield } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Badge } from './badge';

interface UserMenuProps {
  initials: string;
  name: string;
  email?: string;
  title?: string;
  roleLabel: string;
  isAdmin?: boolean;
  myEquipmentPath: string;
  onLogout: () => void;
  className?: string;
}

/**
 * F-6: the old user dropdown had no aria-expanded, no Escape handling, no
 * focus return and an invisible full-screen overlay div with onClick. This is
 * a real menu: keyboard operable, labelled, and dismissable.
 */
export const UserMenu = ({
  initials,
  name,
  email,
  title,
  roleLabel,
  isAdmin = false,
  myEquipmentPath,
  onLogout,
  className,
}: UserMenuProps) => {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const openMenu = () => {
    setOpen(true);
    // Focus the first item after the menu is committed to the DOM.
    requestAnimationFrame(() => firstItemRef.current?.focus());
  };

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            openMenu();
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Korisnički meni: ${name}`}
        className="flex items-center gap-2 rounded-[var(--radius-control)] border border-transparent p-1.5 text-ink transition-colors hover:border-line hover:bg-subtle"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">
          {initials || '?'}
        </span>
        {isAdmin ? <Shield size={14} className="hidden text-brand sm:block" aria-hidden="true" /> : null}
        <ChevronDown
          size={14}
          className={cn('hidden text-ink-subtle transition-transform sm:block', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Korisnički meni"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-[var(--radius-surface)] border border-line bg-panel shadow-raised"
        >
          <div className="border-b border-line bg-subtle px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            {email ? <p className="mt-0.5 truncate text-xs text-ink-muted">{email}</p> : null}
            {title ? <p className="mt-0.5 truncate text-xs text-ink-subtle">{title}</p> : null}
            <Badge tone={isAdmin ? 'info' : 'neutral'} className="mt-2">
              {roleLabel}
            </Badge>
          </div>
          <div className="p-1.5" role="none">
            <Link
              ref={firstItemRef}
              to={myEquipmentPath}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm text-ink transition-colors hover:bg-subtle"
            >
              <Briefcase size={16} aria-hidden="true" /> Moja oprema
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm text-danger-ink transition-colors hover:bg-danger-soft"
            >
              <LogOut size={16} aria-hidden="true" /> Odjavi se
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
