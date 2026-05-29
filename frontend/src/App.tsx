import { useState, useEffect } from 'react';
import { Layout, type PageId } from './components/Layout';
import { LoginPage } from './components/LoginPage';
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
import { resetToDemo, getCurrentUser, isAdmin, isEvidenticar } from './store';
import { useStore } from './useStore';

export default function App() {
  const [state] = useStore();
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    setIsLoggedIn(!!user);
    
    if (user) {
      const admin = isAdmin();
      const evidenticar = isEvidenticar();
      
      // Set default page based on role
      if (!admin && !evidenticar) {
        // Regular user
        if (currentPage !== 'my-equipment' && currentPage !== 'qr-scanner') {
          setCurrentPage('my-equipment');
        }
      }
    }
  }, [state.currentUserId]);

  function handleLoginSuccess() {
    setIsLoggedIn(true);
    if (isAdmin()) {
      setCurrentPage('dashboard');
    } else if (isEvidenticar()) {
      setCurrentPage('dashboard');
    } else {
      setCurrentPage('my-equipment');
    }
  }

  function handleLogout() {
    setIsLoggedIn(false);
    setCurrentPage('dashboard');
  }

  function handleReset() {
    if (confirm('Da li ste sigurni da želite resetovati sve podatke na demo primjer? Svi vaši unosi će biti izgubljeni.')) {
      resetToDemo();
      setIsLoggedIn(false);
    }
  }

  function handleNavigate(page: PageId) {
    const admin = isAdmin();
    const evidenticar = isEvidenticar();
    
    // Admin-only pages
    const adminOnlyPages: PageId[] = ['organization', 'categories', 'user-management'];
    if (!admin && adminOnlyPages.includes(page)) {
      return;
    }
    
    // Admin or evidenticar pages
    const adminOrEvidenticarPages: PageId[] = ['dashboard', 'equipment', 'equipment-by-category', 'transfers', 'documents', 'employees'];
    if (!admin && !evidenticar && adminOrEvidenticarPages.includes(page)) {
      setCurrentPage('my-equipment');
      return;
    }
    
    setCurrentPage(page);
  }

  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const admin = isAdmin();
  const evidenticar = isEvidenticar();

  return (
    <Layout 
      currentPage={currentPage} 
      onNavigate={handleNavigate} 
      onReset={handleReset}
      onLogout={handleLogout}
    >
      {/* Admin-only pages */}
      {admin && currentPage === 'organization' && <OrganizationPage />}
      {admin && currentPage === 'categories' && <CategoriesPage />}
      {admin && currentPage === 'user-management' && <UserManagementPage />}
      
      {/* Admin or evidenticar pages */}
      {(admin || evidenticar) && currentPage === 'dashboard' && <Dashboard />}
      {(admin || evidenticar) && currentPage === 'employees' && <EmployeesPage />}
      {(admin || evidenticar) && currentPage === 'equipment' && <EquipmentPage />}
      {(admin || evidenticar) && currentPage === 'equipment-by-category' && <EquipmentByCategoryPage />}
      {(admin || evidenticar) && currentPage === 'transfers' && <TransfersPage />}
      {(admin || evidenticar) && currentPage === 'documents' && <DocumentsPage />}
      
      {/* All users */}
      {currentPage === 'my-equipment' && <MyEquipmentPage />}
      {currentPage === 'qr-scanner' && <QRScannerPage />}
    </Layout>
  );
}
