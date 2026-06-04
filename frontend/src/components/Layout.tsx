import { useState } from 'react';
import {
  Building2, Users, Package, ArrowLeftRight, FolderTree,
  FileText, LayoutDashboard, ChevronLeft, ChevronRight,
  LogOut, User, Shield, Briefcase, QrCode, List, Layers, ChevronDown, ClipboardList,
  MapPin, Warehouse, Trash2, ClipboardCheck, Settings,
} from 'lucide-react';
import { usePublicSettings } from '../contexts/public-settings-context';
import { isNavPageEnabled } from '../utils/settings-feature.util';
import { cn } from '../utils/cn';
import { getCurrentEmployee, isAdmin, isEvidenticar, isSkladistar, getUserRole } from '../store';
import { useStore } from '../useStore';
import { getOrgUnitPath } from '../helpers';
import { NotificationsPanel } from './NotificationsPanel';
import { useInventoryFreezeBanner } from '../hooks/use-inventory-freeze-banner';
import { InventoryFreezeBanner } from './inventory-count/inventory-freeze-banner';
import { SidebarNavButton } from './sidebar-nav-button';

export type PageId =
  | 'dashboard'
  | 'organization'
  | 'locations'
  | 'warehouses'
  | 'employees'
  | 'categories'
  | 'equipment'
  | 'equipment-by-category'
  | 'transfers'
  | 'documents'
  | 'disposal-commissions'
  | 'inventory-count'
  | 'registrar-stock'
  | 'warehouse-inventory'
  | 'my-equipment'
  | 'qr-scanner'
  | 'user-management'
  | 'settings';

interface LayoutProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({ currentPage, onNavigate, onLogout, children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [equipmentMenuOpen, setEquipmentMenuOpen] = useState(true);
  const [state] = useStore();

  const currentEmployee = getCurrentEmployee();
  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const skladistar = isSkladistar();
  const role = getUserRole();
  const orgUnit = currentEmployee ? state.orgUnits.find(o => o.id === currentEmployee.orgUnitId) : null;
  const { sessions: freezeSessions } = useInventoryFreezeBanner(Boolean(currentEmployee));
  const { settings: publicSettings, getString: getPublicString } = usePublicSettings();
  const appName = getPublicString('app.name', 'Inventar');
  const appSubtitle = getPublicString('app.subtitle', 'Upravljanje opremom');
  const showNavPage = (pageId: PageId): boolean =>
    isNavPageEnabled(pageId, publicSettings, publicSettings);

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
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={cn(
        'bg-slate-900 text-white flex flex-col transition-all duration-300 flex-shrink-0',
        collapsed ? 'w-16' : 'w-64'
      )}>
        {/* Logo */}
        <div className="p-4 border-b border-slate-700 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0">
            IN
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="font-bold text-sm leading-tight truncate">{appName}</h1>
              <p className="text-xs text-slate-400 leading-tight truncate">{appSubtitle}</p>
            </div>
          )}
        </div>

        {/* User Info */}
        {currentEmployee && !collapsed && (
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

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {/* Admin section */}
          {admin && (
            <>
              {!collapsed && <p className="px-4 text-xs text-slate-500 font-semibold uppercase mb-2">Administracija</p>}
              <SidebarNavButton pageId="dashboard" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Kontrolna tabla" icon={LayoutDashboard} visible={showNavPage('dashboard')} />
              <SidebarNavButton pageId="organization" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Organizacija" icon={Building2} visible={showNavPage('organization')} />
              <SidebarNavButton pageId="locations" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Lokacije" icon={MapPin} visible={showNavPage('locations')} />
              <SidebarNavButton pageId="warehouses" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Skladišta" icon={Warehouse} visible={showNavPage('warehouses')} />
              <SidebarNavButton pageId="employees" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Radnici" icon={Users} visible={showNavPage('employees')} />
              <SidebarNavButton pageId="categories" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Kategorije" icon={FolderTree} visible={showNavPage('categories')} />
              <SidebarNavButton pageId="disposal-commissions" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Komisija rashod" icon={Trash2} visible={showNavPage('disposal-commissions')} />
              <SidebarNavButton pageId="inventory-count" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Popis" icon={ClipboardCheck} visible={showNavPage('inventory-count')} />
              <SidebarNavButton pageId="user-management" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Korisnici" icon={ClipboardList} visible={showNavPage('user-management')} />
              <SidebarNavButton pageId="settings" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Postavke" icon={Settings} visible={true} />
            </>
          )}

          {/* Evidenticar section - Dashboard */}
          {evidenticar && !admin && (
            <>
              {!collapsed && <p className="px-4 text-xs text-slate-500 font-semibold uppercase mb-2">Evidencija</p>}
              <SidebarNavButton pageId="dashboard" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Kontrolna tabla" icon={LayoutDashboard} visible={showNavPage('dashboard')} />
              <SidebarNavButton pageId="registrar-stock" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Skladišna roba" icon={Package} visible={showNavPage('registrar-stock')} />
              <SidebarNavButton pageId="employees" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Radnici" icon={Users} visible={showNavPage('employees')} />
              <SidebarNavButton pageId="inventory-count" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Popis" icon={ClipboardCheck} visible={showNavPage('inventory-count')} />
            </>
          )}

          {skladistar && !admin && (
            <>
              {!collapsed && <p className="px-4 text-xs text-slate-500 font-semibold uppercase mb-2">Skladište</p>}
              <SidebarNavButton pageId="warehouses" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Moja skladišta" icon={Package} visible={showNavPage('warehouses')} />
              <SidebarNavButton pageId="warehouse-inventory" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Popis skladišta" icon={ClipboardCheck} visible={showNavPage('warehouse-inventory')} />
            </>
          )}

          {(admin || evidenticar) &&
            (showNavPage('equipment') || showNavPage('transfers') || showNavPage('documents')) && (
            <>
              {!collapsed && <p className="px-4 text-xs text-slate-500 font-semibold uppercase mt-4 mb-2">Oprema</p>}
              {showNavPage('equipment') && (
                <>
                  <button
                    type="button"
                    onClick={() => !collapsed && setEquipmentMenuOpen(!equipmentMenuOpen)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    <Package size={20} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">Oprema</span>
                        <ChevronDown size={14} className={cn('transition-transform', equipmentMenuOpen && 'rotate-180')} />
                      </>
                    )}
                  </button>
                  {(equipmentMenuOpen || collapsed) && (
                    <div className={cn(!collapsed && 'ml-4 border-l border-slate-700')}>
                      <SidebarNavButton
                        pageId="equipment"
                        currentPage={currentPage}
                        onNavigate={onNavigate}
                        collapsed={collapsed}
                        label="Sva oprema"
                        icon={List}
                        visible
                        title="Sva oprema"
                        className="py-2 text-slate-400 hover:text-white"
                      />
                      <SidebarNavButton
                        pageId="equipment-by-category"
                        currentPage={currentPage}
                        onNavigate={onNavigate}
                        collapsed={collapsed}
                        label="Po kategorijama"
                        icon={Layers}
                        visible
                        title="Po kategorijama"
                        className="py-2 text-slate-400 hover:text-white"
                      />
                    </div>
                  )}
                </>
              )}
              <SidebarNavButton pageId="transfers" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Zaduženja" icon={ArrowLeftRight} visible={showNavPage('transfers')} />
              <SidebarNavButton pageId="documents" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Prenosnice" icon={FileText} visible={showNavPage('documents')} />
            </>
          )}

          {(showNavPage('my-equipment') || showNavPage('qr-scanner')) && (
            <>
              {!collapsed && <p className="px-4 text-xs text-slate-500 font-semibold uppercase mt-4 mb-2">Moj profil</p>}
              <SidebarNavButton pageId="my-equipment" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="Moja oprema" icon={Briefcase} visible={showNavPage('my-equipment')} />
              <SidebarNavButton pageId="qr-scanner" currentPage={currentPage} onNavigate={onNavigate} collapsed={collapsed} label="QR Skener" icon={QrCode} visible={showNavPage('qr-scanner')} />
            </>
          )}
        </nav>

        {/* Footer actions */}
        <div className="border-t border-slate-700 p-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-xs text-slate-400 hover:text-red-400 transition-colors"
          >
            <LogOut size={16} />
            {!collapsed && <span>Odjavi se</span>}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center gap-3 px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!collapsed && <span>Smanji meni</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            {currentEmployee && (
              <p className="text-xs text-gray-400">
                {orgUnit ? getOrgUnitPath(state.orgUnits, orgUnit.id) : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <NotificationsPanel />

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center text-sm font-medium text-gray-600">
                  {currentEmployee ? `${currentEmployee.firstName[0]}${currentEmployee.lastName[0]}` : <User size={16} />}
                </div>
                {admin && <Shield size={14} className="text-amber-500" />}
                {evidenticar && !admin && <ClipboardList size={14} className="text-purple-500" />}
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
                        onClick={() => { onNavigate('my-equipment'); setShowUserMenu(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Briefcase size={16} /> Moja oprema
                      </button>
                      <button
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

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-[1400px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
