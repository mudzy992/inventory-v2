import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Building2, Users, Package, ArrowLeftRight, FolderTree,
  LayoutDashboard, ChevronLeft, ChevronRight,
  LogOut, Briefcase, QrCode, List, Layers, ChevronDown, ClipboardList,
  MapPin, Warehouse, Trash2, ClipboardCheck, Settings,
} from 'lucide-react';
import { useAdminSettings } from '../contexts/admin-settings-context';
import { usePublicSettings } from '../contexts/public-settings-context';
import { isNavPageEnabled } from '../utils/settings-feature.util';
import { cn } from '../utils/cn';
import { isAdmin, isEvidenticar, isModerator, isPopisKoordinator, isSkladistar, getUserRole } from '../store';
import { useCurrentEmployee } from '../hooks/use-current-employee';
import { useModuleBadges } from '../hooks/use-module-badges';
import { pathToPageId } from '../routes/app-routes';
import { SidebarNavButton } from './sidebar-nav-button';
import { AppBrand } from './ui/app-brand';
import type { PageId } from './page-id';
import { getRoleBadgeClass, getRoleLabel } from '../helpers/role-display.util';

const NavSection = ({
  label,
  collapsed,
  show,
  children,
  className,
}: {
  label: string;
  collapsed: boolean;
  show: boolean;
  children: ReactNode;
  className?: string;
}) => {
  if (!show) {
    return null;
  }
  return (
    <div className={className}>
      {!collapsed ? (
        <p className="px-4 text-xs text-slate-500 font-semibold uppercase mb-2">{label}</p>
      ) : null}
      {children}
    </div>
  );
};

interface AppSidebarNavProps {
  collapsed: boolean;
  onNavigateComplete?: () => void;
  onLogout?: () => void;
  showCollapseToggle?: boolean;
  onToggleCollapse?: () => void;
  showUserInfo?: boolean;
  appName?: string;
  appSubtitle?: string;
}

export const AppSidebarNav = ({
  collapsed,
  onNavigateComplete,
  onLogout,
  showCollapseToggle = false,
  onToggleCollapse,
  showUserInfo = true,
  appName = 'Evidens',
  appSubtitle = 'Evidencija i zaduženje opreme',
}: AppSidebarNavProps) => {
  const [equipmentMenuOpen, setEquipmentMenuOpen] = useState(true);
  const location = useLocation();
  const currentPage = pathToPageId(location.pathname);
  const currentEmployee = useCurrentEmployee();
  const admin = isAdmin();
  const moderator = isModerator();
  const evidenticar = isEvidenticar();
  const coordinator = isPopisKoordinator();
  const skladistar = isSkladistar();
  const role = getUserRole();
  const { settings: publicSettings } = usePublicSettings();
  const { settings: adminSettings } = useAdminSettings();
  const moduleBadges = useModuleBadges();

  const showNavPage = (pageId: PageId): boolean =>
    isNavPageEnabled(pageId, publicSettings, adminSettings);
  const showEquipmentSection =
    (admin || evidenticar || moderator) &&
    (showNavPage('equipment') || showNavPage('transfers'));
  const showProcessSection =
    (admin && (showNavPage('inventory-count') || showNavPage('disposal-commissions'))) ||
    (moderator && (showNavPage('inventory-count') || showNavPage('disposal-commissions'))) ||
    (evidenticar && !admin && showNavPage('inventory-count')) ||
    (coordinator && showNavPage('inventory-count'));
  const showRegionalAdminSection =
    moderator &&
    !admin &&
    (showNavPage('organization') ||
      showNavPage('employees') ||
      showNavPage('warehouses') ||
      showNavPage('user-management') ||
      showNavPage('employee-relocation'));
  const showMasterDataSection =
    admin &&
    (showNavPage('organization') ||
      showNavPage('locations') ||
      showNavPage('warehouses') ||
      showNavPage('employees') ||
      showNavPage('categories') ||
      showNavPage('registrar-stock'));
  const showRegistrarSection =
    evidenticar &&
    !admin &&
    (showNavPage('employees') || showNavPage('registrar-stock'));
  const showProfileSection = showNavPage('my-equipment') || showNavPage('qr-scanner');

  useEffect(() => {
    if (currentPage === 'equipment' || currentPage === 'equipment-by-category') {
      setEquipmentMenuOpen(true);
    }
  }, [currentPage]);

  const roleLabel = getRoleLabel(role);
  const roleColor = getRoleBadgeClass(role);

  const handleLogout = () => {
    onLogout?.();
    onNavigateComplete?.();
  };

  return (
    <>
      <div className="p-4 border-b border-slate-700">
        {collapsed ? (
          <div className="flex justify-center">
            <AppBrand variant="compact" iconOnly name={appName} showSubtitle={false} />
          </div>
        ) : (
          <AppBrand variant="sidebar" name={appName} subtitle={appSubtitle} />
        )}
      </div>

      {currentEmployee && showUserInfo && !collapsed && (
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center text-sm font-bold">
              {currentEmployee.firstName[0]}{currentEmployee.lastName[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{currentEmployee.firstName} {currentEmployee.lastName}</p>
              <p className="text-xs text-slate-400 truncate">{currentEmployee.title}</p>
            </div>
          </div>
          <div className="mt-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${roleColor}`}>
              {roleLabel.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      <nav className="flex-1 py-4 overflow-y-auto space-y-4">
        <NavSection
          label="Pregled"
          collapsed={collapsed}
          show={(admin || evidenticar || moderator) && showNavPage('dashboard')}
        >
          <SidebarNavButton
            pageId="dashboard"
            collapsed={collapsed}
            label="Kontrolna tabla"
            icon={LayoutDashboard}
            visible={showNavPage('dashboard')}
            onNavigateComplete={onNavigateComplete}
          />
        </NavSection>

        <NavSection label="Oprema" collapsed={collapsed} show={showEquipmentSection}>
          {showNavPage('equipment') ? (
            <>
              <button
                type="button"
                onClick={() => !collapsed && setEquipmentMenuOpen(!equipmentMenuOpen)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'equipment' || currentPage === 'equipment-by-category'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                <Package size={20} />
                {!collapsed ? (
                  <>
                    <span className="flex-1 text-left">Oprema</span>
                    <ChevronDown
                      size={14}
                      className={cn('transition-transform', equipmentMenuOpen && 'rotate-180')}
                    />
                  </>
                ) : null}
              </button>
              {(equipmentMenuOpen || collapsed) ? (
                <div className={cn(!collapsed && 'ml-4 border-l border-slate-700')}>
                  <SidebarNavButton
                    pageId="equipment"
                    collapsed={collapsed}
                    label="Sva oprema"
                    icon={List}
                    visible={showNavPage('equipment')}
                    title="Sva oprema"
                    className="py-2 text-slate-400 hover:text-white"
                    badge={moduleBadges.equipment}
                    onNavigateComplete={onNavigateComplete}
                  />
                  <SidebarNavButton
                    pageId="equipment-by-category"
                    collapsed={collapsed}
                    label="Po kategorijama"
                    icon={Layers}
                    visible={showNavPage('equipment-by-category')}
                    title="Po kategorijama"
                    className="py-2 text-slate-400 hover:text-white"
                    onNavigateComplete={onNavigateComplete}
                  />
                </div>
              ) : null}
            </>
          ) : null}
          <SidebarNavButton
            pageId="transfers"
            collapsed={collapsed}
            label="Zaduženja"
            icon={ArrowLeftRight}
            visible={showNavPage('transfers')}
            badge={moduleBadges.transfers}
            alsoActivePaths={['/documents']}
            onNavigateComplete={onNavigateComplete}
          />
        </NavSection>

        <NavSection label="Procesi" collapsed={collapsed} show={showProcessSection}>
          <SidebarNavButton
            pageId="inventory-count"
            collapsed={collapsed}
            label="Popis"
            icon={ClipboardCheck}
            visible={showNavPage('inventory-count') && (admin || evidenticar || coordinator || moderator)}
            badge={moduleBadges['inventory-count']}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="disposal-commissions"
            collapsed={collapsed}
            label="Komisija rashod"
            icon={Trash2}
            visible={(admin || moderator) && showNavPage('disposal-commissions')}
            badge={moduleBadges['disposal-commissions']}
            onNavigateComplete={onNavigateComplete}
          />
        </NavSection>

        <NavSection
          label="Skladište"
          collapsed={collapsed}
          show={skladistar && !admin && (showNavPage('warehouses') || showNavPage('warehouse-inventory'))}
        >
          <SidebarNavButton
            pageId="warehouses"
            collapsed={collapsed}
            label="Moja skladišta"
            icon={Warehouse}
            visible={showNavPage('warehouses')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="warehouse-inventory"
            collapsed={collapsed}
            label="Popis skladišta"
            icon={ClipboardCheck}
            visible={showNavPage('warehouse-inventory')}
            onNavigateComplete={onNavigateComplete}
          />
        </NavSection>

        <NavSection label="Regionalna administracija" collapsed={collapsed} show={showRegionalAdminSection}>
          <SidebarNavButton
            pageId="organization"
            collapsed={collapsed}
            label="Organizacija"
            icon={Building2}
            visible={showNavPage('organization')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="employees"
            collapsed={collapsed}
            label="Radnici"
            icon={Users}
            visible={showNavPage('employees')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="warehouses"
            collapsed={collapsed}
            label="Skladišta"
            icon={Warehouse}
            visible={showNavPage('warehouses')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="user-management"
            collapsed={collapsed}
            label="Korisnici"
            icon={ClipboardList}
            visible={showNavPage('user-management')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="employee-relocation"
            collapsed={collapsed}
            label="Org. promjena"
            icon={ArrowLeftRight}
            visible={showNavPage('employee-relocation')}
            badge={moduleBadges['employee-relocation']}
            onNavigateComplete={onNavigateComplete}
          />
        </NavSection>

        <NavSection label="Šifarnici" collapsed={collapsed} show={showMasterDataSection}>
          <SidebarNavButton
            pageId="organization"
            collapsed={collapsed}
            label="Organizacija"
            icon={Building2}
            visible={showNavPage('organization')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="locations"
            collapsed={collapsed}
            label="Lokacije"
            icon={MapPin}
            visible={showNavPage('locations')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="warehouses"
            collapsed={collapsed}
            label="Skladišta"
            icon={Warehouse}
            visible={showNavPage('warehouses')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="employees"
            collapsed={collapsed}
            label="Radnici"
            icon={Users}
            visible={showNavPage('employees')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="categories"
            collapsed={collapsed}
            label="Kategorije"
            icon={FolderTree}
            visible={showNavPage('categories')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="registrar-stock"
            collapsed={collapsed}
            label="Skladišna roba"
            icon={Package}
            visible={showNavPage('registrar-stock')}
            badge={moduleBadges['registrar-stock']}
            matchNested
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="employee-relocation"
            collapsed={collapsed}
            label="Org. promjena"
            icon={ArrowLeftRight}
            visible={showNavPage('employee-relocation')}
            badge={moduleBadges['employee-relocation']}
            onNavigateComplete={onNavigateComplete}
          />
        </NavSection>

        <NavSection label="Registar" collapsed={collapsed} show={showRegistrarSection}>
          <SidebarNavButton
            pageId="employees"
            collapsed={collapsed}
            label="Radnici"
            icon={Users}
            visible={showNavPage('employees')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="registrar-stock"
            collapsed={collapsed}
            label="Skladišna roba"
            icon={Package}
            visible={showNavPage('registrar-stock')}
            badge={moduleBadges['registrar-stock']}
            matchNested
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="employee-relocation"
            collapsed={collapsed}
            label="Org. promjena"
            icon={ArrowLeftRight}
            visible={showNavPage('employee-relocation')}
            badge={moduleBadges['employee-relocation']}
            onNavigateComplete={onNavigateComplete}
          />
        </NavSection>

        <NavSection label="Sistem" collapsed={collapsed} show={admin}>
          <SidebarNavButton
            pageId="user-management"
            collapsed={collapsed}
            label="Korisnici"
            icon={ClipboardList}
            visible={showNavPage('user-management')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="settings"
            collapsed={collapsed}
            label="Postavke"
            icon={Settings}
            visible={true}
            onNavigateComplete={onNavigateComplete}
          />
        </NavSection>

        <NavSection label="Moj profil" collapsed={collapsed} show={showProfileSection}>
          <SidebarNavButton
            pageId="my-equipment"
            collapsed={collapsed}
            label="Moja oprema"
            icon={Briefcase}
            visible={showNavPage('my-equipment')}
            onNavigateComplete={onNavigateComplete}
          />
          <SidebarNavButton
            pageId="qr-scanner"
            collapsed={collapsed}
            label="QR Skener"
            icon={QrCode}
            visible={showNavPage('qr-scanner')}
            onNavigateComplete={onNavigateComplete}
          />
        </NavSection>
      </nav>

      {(onLogout || showCollapseToggle) && (
        <div className="border-t border-slate-700 p-2">
          {onLogout ? (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2 text-xs text-slate-400 hover:text-red-400 transition-colors"
            >
              <LogOut size={16} />
              {!collapsed && <span>Odjavi se</span>}
            </button>
          ) : null}
          {showCollapseToggle && onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="w-full flex items-center gap-3 px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              {!collapsed && <span>Smanji meni</span>}
            </button>
          ) : null}
        </div>
      )}
    </>
  );
};
