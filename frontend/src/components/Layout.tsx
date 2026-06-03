import { useState } from 'react';
import {
  Building2, Users, Package, ArrowLeftRight, FolderTree,
  FileText, LayoutDashboard, RotateCcw, ChevronLeft, ChevronRight,
  LogOut, User, Shield, Briefcase, QrCode, List, Layers, ChevronDown, ClipboardList,
  MapPin, Warehouse, Trash2, ClipboardCheck,
} from 'lucide-react';
import { cn } from '../utils/cn';
import { getCurrentEmployee, isAdmin, isEvidenticar, isSkladistar, getUserRole } from '../store';
import { useStore } from '../useStore';
import { getOrgUnitPath } from '../helpers';
import { NotificationsPanel } from './NotificationsPanel';
import { useInventoryFreezeBanner } from '../hooks/use-inventory-freeze-banner';
import { InventoryFreezeBanner } from './inventory-count/inventory-freeze-banner';

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
  | 'user-management';

interface LayoutProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  onReset: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({ currentPage, onNavigate, onReset, onLogout, children }: LayoutProps) {
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
              <h1 className="font-bold text-sm leading-tight">Inventar</h1>
              <p className="text-xs text-slate-400 leading-tight">Upravljanje opremom</p>
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
              <button
                onClick={() => onNavigate('dashboard')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <LayoutDashboard size={20} />
                {!collapsed && <span>Kontrolna tabla</span>}
              </button>
              <button
                onClick={() => onNavigate('organization')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'organization' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <Building2 size={20} />
                {!collapsed && <span>Organizacija</span>}
              </button>
              <button
                onClick={() => onNavigate('locations')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'locations' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                <MapPin size={20} />
                {!collapsed && <span>Lokacije</span>}
              </button>
              <button
                onClick={() => onNavigate('warehouses')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'warehouses' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                <Warehouse size={20} />
                {!collapsed && <span>Skladišta</span>}
              </button>
              <button
                onClick={() => onNavigate('employees')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'employees' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <Users size={20} />
                {!collapsed && <span>Radnici</span>}
              </button>
              <button
                onClick={() => onNavigate('categories')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'categories' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <FolderTree size={20} />
                {!collapsed && <span>Kategorije</span>}
              </button>
              <button
                onClick={() => onNavigate('disposal-commissions')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'disposal-commissions' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                <Trash2 size={20} />
                {!collapsed && <span>Komisija rashod</span>}
              </button>
              <button
                onClick={() => onNavigate('inventory-count')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'inventory-count' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                <ClipboardCheck size={20} />
                {!collapsed && <span>Popis</span>}
              </button>
              <button
                onClick={() => onNavigate('user-management')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'user-management' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <ClipboardList size={20} />
                {!collapsed && <span>Korisnici</span>}
              </button>
            </>
          )}

          {/* Evidenticar section - Dashboard */}
          {evidenticar && !admin && (
            <>
              {!collapsed && <p className="px-4 text-xs text-slate-500 font-semibold uppercase mb-2">Evidencija</p>}
              <button
                onClick={() => onNavigate('dashboard')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <LayoutDashboard size={20} />
                {!collapsed && <span>Kontrolna tabla</span>}
              </button>
              <button
                onClick={() => onNavigate('registrar-stock')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'registrar-stock' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                <Package size={20} />
                {!collapsed && <span>Skladišna roba</span>}
              </button>
              <button
                onClick={() => onNavigate('employees')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'employees' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <Users size={20} />
                {!collapsed && <span>Radnici</span>}
              </button>
              <button
                onClick={() => onNavigate('inventory-count')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'inventory-count' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                <ClipboardCheck size={20} />
                {!collapsed && <span>Popis</span>}
              </button>
            </>
          )}

          {skladistar && !admin && (
            <>
              {!collapsed && <p className="px-4 text-xs text-slate-500 font-semibold uppercase mb-2">Skladište</p>}
              <button
                onClick={() => onNavigate('warehouses')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'warehouses' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                <Package size={20} />
                {!collapsed && <span>Moja skladišta</span>}
              </button>
              <button
                onClick={() => onNavigate('warehouse-inventory')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'warehouse-inventory' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                <ClipboardCheck size={20} />
                {!collapsed && <span>Popis skladišta</span>}
              </button>
            </>
          )}

          {/* Equipment submenu - for admin and evidenticar */}
          {(admin || evidenticar) && (
            <>
              {!collapsed && <p className="px-4 text-xs text-slate-500 font-semibold uppercase mt-4 mb-2">Oprema</p>}
              <button
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
                  <button
                    onClick={() => onNavigate('equipment')}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors',
                      currentPage === 'equipment' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    )}
                    title={collapsed ? 'Sva oprema' : undefined}
                  >
                    <List size={16} />
                    {!collapsed && <span>Sva oprema</span>}
                  </button>
                  <button
                    onClick={() => onNavigate('equipment-by-category')}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors',
                      currentPage === 'equipment-by-category' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    )}
                    title={collapsed ? 'Po kategorijama' : undefined}
                  >
                    <Layers size={16} />
                    {!collapsed && <span>Po kategorijama</span>}
                  </button>
                </div>
              )}

              <button
                onClick={() => onNavigate('transfers')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'transfers' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <ArrowLeftRight size={20} />
                {!collapsed && <span>Zaduženja</span>}
              </button>
              <button
                onClick={() => onNavigate('documents')}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  currentPage === 'documents' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <FileText size={20} />
                {!collapsed && <span>Prenosnice</span>}
              </button>
            </>
          )}

          {/* User section - for all */}
          {!collapsed && <p className="px-4 text-xs text-slate-500 font-semibold uppercase mt-4 mb-2">Moj profil</p>}
          <button
            onClick={() => onNavigate('my-equipment')}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
              currentPage === 'my-equipment' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            )}
          >
            <Briefcase size={20} />
            {!collapsed && <span>Moja oprema</span>}
          </button>
          <button
            onClick={() => onNavigate('qr-scanner')}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
              currentPage === 'qr-scanner' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            )}
          >
            <QrCode size={20} />
            {!collapsed && <span>QR Skener</span>}
          </button>
        </nav>

        {/* Footer actions */}
        <div className="border-t border-slate-700 p-2">
          {admin && import.meta.env.DEV && (
            <button
              onClick={onReset}
              className="w-full flex items-center gap-3 px-4 py-2 text-xs text-slate-400 hover:text-red-400 transition-colors"
              title="Resetuj na demo podatke"
            >
              <RotateCcw size={16} />
              {!collapsed && <span>Reset demo</span>}
            </button>
          )}
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
