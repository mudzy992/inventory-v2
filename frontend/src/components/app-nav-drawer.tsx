import { useEffect } from 'react';
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
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Zatvori navigaciju"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-[min(100%,20rem)] flex-col bg-slate-900 text-white shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          aria-label="Zatvori"
        >
          <X size={20} />
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
