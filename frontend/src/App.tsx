import { useState, useEffect } from 'react';
import { fetchSetupStatusApi } from './api/setup-api';
import { Layout, type PageId } from './components/Layout';
import { LoginPage } from './components/LoginPage';
import { PublicEquipmentPage } from './components/public-equipment-page';
import { SetupWizardPage } from './components/setup/setup-wizard-page';
import { parsePublicEquipmentPath } from './lib/parse-public-equipment-path';
import { Dashboard } from './components/Dashboard';
import { OrganizationPage } from './components/OrganizationPage';
import { EmployeesPage } from './components/EmployeesPage';
import { CategoriesPage } from './components/CategoriesPage';
import { EquipmentPage } from './components/EquipmentPage';
import { EquipmentByCategoryPage } from './components/EquipmentByCategoryPage';
import { TransfersPage } from './components/TransfersPage';
import { DocumentsPage } from './components/DocumentsPage';
import { MyEquipmentPage } from './components/MyEquipmentPage';
import { QRScannerPage } from './components/QRScannerPage';
import { UserManagementPage } from './components/UserManagementPage';
import { LocationsPage } from './components/LocationsPage';
import { WarehousesPage } from './components/WarehousesPage';
import { DisposalCommissionsPage } from './components/DisposalCommissionsPage';
import { InventoryCountPage } from './components/InventoryCountPage';
import { RegistrarStockPage } from './components/registrar-stock/registrar-stock-page';
import { EmployeeRelocationPage } from './components/employee-relocation/employee-relocation-page';
import { WarehouseInventoryPage } from './components/inventory-count/warehouse-inventory-page';
import { SettingsPage } from './components/settings/settings-page';
import { isAdmin, isEvidenticar, isSkladistar } from './store';
import { usePublicSettings } from './contexts/public-settings-context';
import { useAdminSettings } from './contexts/admin-settings-context';
import { LayoutNavGate } from './components/layout-nav-gate';
import { isNavPageEnabled } from './utils/settings-feature.util';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';

const ADMIN_ONLY_PAGES: PageId[] = [
  'organization',
  'locations',
  'categories',
  'user-management',
  'disposal-commissions',
  'settings',
];

const ADMIN_OR_EVIDENTICAR_INVENTORY_PAGES: PageId[] = ['inventory-count'];

const ADMIN_OR_EVIDENTICAR_PAGES: PageId[] = [
  'dashboard',
  'equipment',
  'equipment-by-category',
  'transfers',
  'documents',
  'employees',
  'registrar-stock',
  'employee-relocation',
];

const SKLADISTAR_PAGES: PageId[] = ['warehouses', 'warehouse-inventory', 'my-equipment', 'qr-scanner'];

export default function App() {
  const publicEquipmentId = parsePublicEquipmentPath(window.location.pathname);
  if (publicEquipmentId) {
    return <PublicEquipmentPage equipmentId={publicEquipmentId} />;
  }

  return <AppMain />;
}

function AppMain() {
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { isLoading: dataLoading, error: dataError } = useData();
  const { settings: publicSettings } = usePublicSettings();
  const { settings: adminSettings } = useAdminSettings();
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [setupJustFinished, setSetupJustFinished] = useState(false);

  useEffect(() => {
    const loadSetupStatus = async () => {
      try {
        const status = await fetchSetupStatusApi();
        setNeedsSetup(status.needsSetup);
      } catch {
        setNeedsSetup(false);
      }
    };
    void loadSetupStatus();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const admin = isAdmin();
    const evidenticar = isEvidenticar();
    const skladistar = isSkladistar();
    if (skladistar && !admin && currentPage === 'dashboard') {
      setCurrentPage('warehouses');
      return;
    }
    if (!admin && !evidenticar && !skladistar) {
      if (currentPage !== 'my-equipment' && currentPage !== 'qr-scanner') {
        setCurrentPage('my-equipment');
      }
    }
    if (!isNavPageEnabled(currentPage, publicSettings, adminSettings)) {
      if (admin || evidenticar) {
        setCurrentPage('dashboard');
      } else if (skladistar) {
        setCurrentPage('warehouses');
      } else {
        setCurrentPage('my-equipment');
      }
    }
  }, [isAuthenticated, currentPage, publicSettings, adminSettings]);

  const handleLoginSuccess = () => {
    if (isAdmin() || isEvidenticar()) {
      setCurrentPage('dashboard');
    } else if (isSkladistar()) {
      setCurrentPage('warehouses');
    } else {
      setCurrentPage('my-equipment');
    }
  };

  const handleLogout = async () => {
    await logout();
    setCurrentPage('dashboard');
  };

  const handleNavigate = (page: PageId) => {
    const admin = isAdmin();
    const evidenticar = isEvidenticar();
    const skladistar = isSkladistar();
    if (!admin && ADMIN_ONLY_PAGES.includes(page)) {
      return;
    }
    if (!admin && !evidenticar && ADMIN_OR_EVIDENTICAR_INVENTORY_PAGES.includes(page)) {
      return;
    }
    if (skladistar && !admin && !SKLADISTAR_PAGES.includes(page)) {
      setCurrentPage('warehouses');
      return;
    }
    if (!admin && !evidenticar && !skladistar && ADMIN_OR_EVIDENTICAR_PAGES.includes(page)) {
      setCurrentPage('my-equipment');
      return;
    }
    if (!isNavPageEnabled(page, publicSettings, adminSettings)) {
      return;
    }
    setCurrentPage(page);
  };

  if (needsSetup === null || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        Učitavanje...
      </div>
    );
  }

  if (needsSetup) {
    return (
      <SetupWizardPage
        onComplete={() => {
          setNeedsSetup(false);
          setSetupJustFinished(true);
        }}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        setupSuccessMessage={
          setupJustFinished ? 'Instalacija je završena. Prijavite se sa administratorskim nalogom.' : undefined
        }
      />
    );
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        Učitavanje podataka...
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white border border-red-200 rounded-xl p-6 max-w-md text-center">
          <p className="text-red-600 font-medium mb-2">Greška pri učitavanju</p>
          <p className="text-sm text-gray-600">{dataError}</p>
        </div>
      </div>
    );
  }

  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const skladistar = isSkladistar();

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={handleNavigate}
      onLogout={() => void handleLogout()}
    >
      {admin && currentPage === 'organization' && (
        <LayoutNavGate pageId="organization">
          <OrganizationPage />
        </LayoutNavGate>
      )}
      {admin && currentPage === 'locations' && (
        <LayoutNavGate pageId="locations">
          <LocationsPage />
        </LayoutNavGate>
      )}
      {(admin || skladistar) && currentPage === 'warehouses' && (
        <LayoutNavGate pageId="warehouses">
          <WarehousesPage onNavigate={handleNavigate} />
        </LayoutNavGate>
      )}
      {admin && currentPage === 'categories' && (
        <LayoutNavGate pageId="categories">
          <CategoriesPage />
        </LayoutNavGate>
      )}
      {admin && currentPage === 'user-management' && (
        <LayoutNavGate pageId="user-management">
          <UserManagementPage />
        </LayoutNavGate>
      )}
      {admin && currentPage === 'settings' && <SettingsPage />}
      {admin && currentPage === 'disposal-commissions' && (
        <LayoutNavGate pageId="disposal-commissions">
          <DisposalCommissionsPage />
        </LayoutNavGate>
      )}
      {(admin || evidenticar) && currentPage === 'inventory-count' && (
        <LayoutNavGate pageId="inventory-count">
          <InventoryCountPage />
        </LayoutNavGate>
      )}
      {(admin || evidenticar) && currentPage === 'registrar-stock' && (
        <LayoutNavGate pageId="registrar-stock">
          <RegistrarStockPage />
        </LayoutNavGate>
      )}
      {(admin || evidenticar) && currentPage === 'employee-relocation' && (
        <LayoutNavGate pageId="employee-relocation">
          <EmployeeRelocationPage />
        </LayoutNavGate>
      )}
      {skladistar && !admin && currentPage === 'warehouse-inventory' && (
        <LayoutNavGate pageId="warehouse-inventory">
          <WarehouseInventoryPage />
        </LayoutNavGate>
      )}
      {(admin || evidenticar) && currentPage === 'dashboard' && (
        <LayoutNavGate pageId="dashboard">
          <Dashboard onNavigate={handleNavigate} />
        </LayoutNavGate>
      )}
      {(admin || evidenticar) && currentPage === 'employees' && (
        <LayoutNavGate pageId="employees">
          <EmployeesPage />
        </LayoutNavGate>
      )}
      {(admin || evidenticar) && currentPage === 'equipment' && (
        <LayoutNavGate pageId="equipment">
          <EquipmentPage onNavigate={handleNavigate} />
        </LayoutNavGate>
      )}
      {(admin || evidenticar) && currentPage === 'equipment-by-category' && (
        <LayoutNavGate pageId="equipment-by-category">
          <EquipmentByCategoryPage />
        </LayoutNavGate>
      )}
      {(admin || evidenticar) && currentPage === 'transfers' && (
        <LayoutNavGate pageId="transfers">
          <TransfersPage onNavigate={handleNavigate} />
        </LayoutNavGate>
      )}
      {(admin || evidenticar) && currentPage === 'documents' && (
        <LayoutNavGate pageId="documents">
          <DocumentsPage />
        </LayoutNavGate>
      )}
      {currentPage === 'my-equipment' && (
        <LayoutNavGate pageId="my-equipment">
          <MyEquipmentPage />
        </LayoutNavGate>
      )}
      {currentPage === 'qr-scanner' && (
        <LayoutNavGate pageId="qr-scanner">
          <QRScannerPage />
        </LayoutNavGate>
      )}
    </Layout>
  );
}
