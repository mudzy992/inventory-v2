import { useState } from 'react';
import {
  LogOut, User, Shield, Briefcase, ClipboardList, Menu,
} from 'lucide-react';
import { usePublicSettings } from '../contexts/public-settings-context';
import { useIsPageEnabled } from '../hooks/use-is-page-enabled';
import { cn } from '../utils/cn';
import { isAdmin, isEvidenticar, getUserRole } from '../store';
import { useCurrentEmployee } from '../hooks/use-current-employee';
import { useStore } from '../useStore';
import { getOrgUnitPath } from '../helpers';
import { NotificationsPanel } from './NotificationsPanel';
import { useInventoryFreezeBanner } from '../hooks/use-inventory-freeze-banner';
import { InventoryFreezeBanner } from './inventory-count/inventory-freeze-banner';
import { AppSidebarNav } from './app-sidebar-nav';
import { AppNavDrawer } from './app-nav-drawer';

export type { PageId } from './page-id';

interface LayoutProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({ currentPage, onNavigate, onLogout, children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [state] = useStore();

  const currentEmployee = useCurrentEmployee();
  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const role = getUserRole();
  const orgUnit = currentEmployee ? state.orgUnits.find(o => o.id === currentEmployee.orgUnitId) : null;
  const inventoryCountEnabled = useIsPageEnabled('inventory-count');
  const { sessions: freezeSessions } = useInventoryFreezeBanner(
    Boolean(currentEmployee) && inventoryCountEnabled,
  );
  const { getString: getPublicString } = usePublicSettings();
  const appName = getPublicString('app.name', 'Inventar');
  const appSubtitle = getPublicString('app.subtitle', 'Upravljanje opremom');

  const handleLogout = () => {
    onLogout();
  };

  const roleLabel =
    role === 'admin'
      ? 'Administrator'
      : role === 'evidenticar'
        ? 'Evidentičar'
        : role === 'skladistar'
          ? 'Skladištar'
          : 'Korisnik';
  const roleColor =
    role === 'admin'
      ? 'bg-amber-500 text-amber-900'
      : role === 'evidenticar'
        ? 'bg-purple-500 text-purple-100'
        : role === 'skladistar'
          ? 'bg-teal-500 text-teal-900'
          : 'bg-gray-500 text-gray-100';

  return (
    <div className="flex h-[100dvh] bg-gray-50">
      <aside
        className={cn(
          'hidden lg:flex bg-slate-900 text-white flex-col transition-all duration-300 flex-shrink-0',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <AppSidebarNav
          currentPage={currentPage}
          onNavigate={onNavigate}
          collapsed={collapsed}
          onLogout={handleLogout}
          showCollapseToggle
          onToggleCollapse={() => setCollapsed(!collapsed)}
          showUserInfo
          appName={appName}
          appSubtitle={appSubtitle}
        />
      </aside>

      <AppNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        currentPage={currentPage}
        onNavigate={onNavigate}
        onLogout={handleLogout}
        appName={appName}
        appSubtitle={appSubtitle}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-1 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              aria-label="Otvori navigaciju"
            >
              <Menu size={20} className="text-gray-600" />
            </button>
            {currentEmployee && (
              <p className="text-xs text-gray-400 truncate min-w-0">
                {orgUnit ? getOrgUnitPath(state.orgUnits, orgUnit.id) : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <NotificationsPanel />

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center text-sm font-medium text-gray-600">
                  {currentEmployee ? `${currentEmployee.firstName[0]}${currentEmployee.lastName[0]}` : <User size={16} />}
                </div>
                {admin && <Shield size={14} className="text-amber-500 hidden sm:block" />}
                {evidenticar && !admin && <ClipboardList size={14} className="text-purple-500 hidden sm:block" />}
              </button>

              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                    {currentEmployee && (
                      <div className="p-4 bg-gray-50">
                        <p className="font-medium text-gray-800">{currentEmployee.firstName} {currentEmployee.lastName}</p>
                        <p className="text-xs text-gray-500">{currentEmployee.email}</p>
                        <p className="text-xs text-gray-400 mt-1">{currentEmployee.title}</p>
                        <span className={`inline-flex items-center gap-1 mt-2 text-xs px-2 py-0.5 rounded ${roleColor}`}>
                          {role === 'admin' && <Shield size={10} />}
                          {role === 'evidenticar' && <ClipboardList size={10} />}
                          {roleLabel}
                        </span>
                      </div>
                    )}
                    <div className="p-2">
                      <button
                        type="button"
                        onClick={() => { onNavigate('my-equipment'); setShowUserMenu(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Briefcase size={16} /> Moja oprema
                      </button>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <LogOut size={16} /> Odjavi se
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <InventoryFreezeBanner sessions={freezeSessions} onNavigate={onNavigate} />

        <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
          <div className="px-4 pt-4 pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-6 sm:pb-8 max-w-[1400px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
