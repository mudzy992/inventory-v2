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
import { WarehouseInventoryPage } from './components/inventory-count/warehouse-inventory-page';
import { resetToDemo, isAdmin, isEvidenticar, isSkladistar } from './store';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';

const ADMIN_ONLY_PAGES: PageId[] = [
  'organization',
  'locations',
  'categories',
  'user-management',
  'disposal-commissions',
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
  }, [isAuthenticated, currentPage]);

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

  const handleReset = () => {
    if (!import.meta.env.DEV) {
      return;
    }
    if (
      confirm(
        'Da li ste sigurni da želite resetovati na demo primjer? (samo lokalni dev fallback)',
      )
    ) {
      resetToDemo();
    }
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
      onReset={handleReset}
      onLogout={() => void handleLogout()}
    >
      {admin && currentPage === 'organization' && <OrganizationPage />}
      {admin && currentPage === 'locations' && <LocationsPage />}
      {(admin || skladistar) && currentPage === 'warehouses' && (
        <WarehousesPage onNavigate={handleNavigate} />
      )}
      {admin && currentPage === 'categories' && <CategoriesPage />}
      {admin && currentPage === 'user-management' && <UserManagementPage />}
      {admin && currentPage === 'disposal-commissions' && <DisposalCommissionsPage />}
      {(admin || evidenticar) && currentPage === 'inventory-count' && <InventoryCountPage />}
      {(admin || evidenticar) && currentPage === 'registrar-stock' && <RegistrarStockPage />}
      {skladistar && !admin && currentPage === 'warehouse-inventory' && <WarehouseInventoryPage />}

      {(admin || evidenticar) && currentPage === 'dashboard' && (
        <Dashboard onNavigate={handleNavigate} />
      )}
      {(admin || evidenticar) && currentPage === 'employees' && <EmployeesPage />}
      {(admin || evidenticar) && currentPage === 'equipment' && (
        <EquipmentPage onNavigate={handleNavigate} />
      )}
      {(admin || evidenticar) && currentPage === 'equipment-by-category' && (
        <EquipmentByCategoryPage />
      )}
      {(admin || evidenticar) && currentPage === 'transfers' && (
        <TransfersPage onNavigate={handleNavigate} />
      )}
      {(admin || evidenticar) && currentPage === 'documents' && <DocumentsPage />}

      {currentPage === 'my-equipment' && <MyEquipmentPage />}
      {currentPage === 'qr-scanner' && <QRScannerPage />}
    </Layout>
  );
}
