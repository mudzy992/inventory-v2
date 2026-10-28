import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { AppSidebarNav } from './app-sidebar-nav';

interface AppNavDrawerProps {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  appName: string;
  appSubtitle: string;
}

export const AppNavDrawer = ({
  open,
  onClose,
  onLogout,
  appName,
  appSubtitle,
}: AppNavDrawerProps) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-ink/40 backdrop-blur-[2px]"
        aria-label="Zatvori navigaciju"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Glavna navigacija"
        className="relative flex h-full w-[min(100%,20rem)] flex-col border-r border-line bg-panel text-ink shadow-raised"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-[var(--radius-control)] p-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
          aria-label="Zatvori navigaciju"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <AppSidebarNav
          collapsed={false}
          onNavigateComplete={onClose}
          onLogout={onLogout}
          showUserInfo
          appName={appName}
          appSubtitle={appSubtitle}
        />
      </aside>
    </div>
  );
};
