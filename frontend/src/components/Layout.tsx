import { useState } from 'react';
import { Building2, Menu } from 'lucide-react';
import { usePublicSettings } from '../contexts/public-settings-context';
import { useIsPageEnabled } from '../hooks/use-is-page-enabled';
import { cn } from '../utils/cn';
import { isAdmin, getUserRole } from '../store';
import { useCurrentEmployee } from '../hooks/use-current-employee';
import { useStore } from '../useStore';
import { getOrgUnitPath } from '../helpers';
import { getRoleLabel } from '../helpers/role-display.util';
import { NotificationsPanel } from './NotificationsPanel';
import { useInventoryFreezeBanner } from '../hooks/use-inventory-freeze-banner';
import { InventoryFreezeBanner } from './inventory-count/inventory-freeze-banner';
import { AppSidebarNav } from './app-sidebar-nav';
import { AppNavDrawer } from './app-nav-drawer';
import { UserMenu } from './ui/user-menu';
import { pageIdToPath } from '../routes/app-routes';

export type { PageId } from './page-id';

interface LayoutProps {
  onLogout: () => void;
  children: React.ReactNode;
}

/**
 * Evidens Surface application shell — light, high-contrast chrome with a
 * keyboard skip link (F-4), an accessible user menu (F-6) and a single
 * scroll container. All business pages render unchanged inside <main>.
 */
export function Layout({ onLogout, children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [state] = useStore();

  const currentEmployee = useCurrentEmployee();
  const admin = isAdmin();
  const role = getUserRole();
  const orgUnit = currentEmployee
    ? state.orgUnits.find((unit) => unit.id === currentEmployee.orgUnitId)
    : null;
  const inventoryCountEnabled = useIsPageEnabled('inventory-count');
  const { sessions: freezeSessions, productionLockSessions } = useInventoryFreezeBanner(
    Boolean(currentEmployee) && inventoryCountEnabled,
  );
  const { getString: getPublicString } = usePublicSettings();
  const appName = getPublicString('app.name', 'Evidens');
  const appSubtitle = getPublicString('app.subtitle', 'Evidencija i zaduženje opreme');

  const initials = currentEmployee
    ? `${currentEmployee.firstName[0] ?? ''}${currentEmployee.lastName[0] ?? ''}`.toUpperCase()
    : '?';

  return (
    <div className="flex h-[100dvh] bg-canvas text-ink">
      <a href="#main-content" className="ds-skip-link">
        Preskoči na sadržaj
      </a>

      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-line bg-panel transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[4.75rem]' : 'w-64',
        )}
      >
        <AppSidebarNav
          collapsed={collapsed}
          onLogout={onLogout}
          showCollapseToggle
          onToggleCollapse={() => setCollapsed((value) => !value)}
          showUserInfo
          appName={appName}
          appSubtitle={appSubtitle}
        />
      </aside>

      <AppNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onLogout={onLogout}
        appName={appName}
        appSubtitle={appSubtitle}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-30 flex shrink-0 items-center justify-between gap-3 border-b border-line bg-panel/85 px-4 py-2.5 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="-ml-1 flex-shrink-0 rounded-[var(--radius-control)] p-2 text-ink-muted transition-colors hover:bg-subtle hover:text-ink lg:hidden"
              aria-label="Otvori navigaciju"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            {currentEmployee ? (
              <p className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
                <Building2 size={14} className="shrink-0 text-ink-subtle" aria-hidden="true" />
                <span className="truncate">
                  {orgUnit ? getOrgUnitPath(state.orgUnits, orgUnit.id) : 'Organizaciona jedinica'}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
            <NotificationsPanel />
            <UserMenu
              initials={initials}
              name={
                currentEmployee
                  ? `${currentEmployee.firstName} ${currentEmployee.lastName}`
                  : appName
              }
              email={currentEmployee?.email ?? undefined}
              title={currentEmployee?.title ?? undefined}
              roleLabel={getRoleLabel(role ?? 'user')}
              isAdmin={admin}
              myEquipmentPath={pageIdToPath('my-equipment')}
              onLogout={onLogout}
            />
          </div>
        </header>

        <InventoryFreezeBanner
          sessions={freezeSessions}
          productionLockSessions={productionLockSessions}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="ds-scroll-area min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
        >
          <div className="mx-auto w-full max-w-[1440px] px-4 pb-[max(2.5rem,env(safe-area-inset-bottom,0px))] pt-5 sm:px-6 sm:pt-6 sm:pb-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
