import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Dashboard } from '../components/Dashboard';
import { OrganizationPage } from '../components/OrganizationPage';
import { EmployeesPage } from '../components/EmployeesPage';
import { CategoriesPage } from '../components/CategoriesPage';
import { EquipmentPage } from '../components/EquipmentPage';
import { EquipmentByCategoryPage } from '../components/EquipmentByCategoryPage';
import { TransfersPage } from '../components/TransfersPage';
import { DocumentsPage } from '../components/DocumentsPage';
import { MyEquipmentPage } from '../components/MyEquipmentPage';
import { QRScannerPage } from '../components/QRScannerPage';
import { UserManagementPage } from '../components/UserManagementPage';
import { LocationsPage } from '../components/LocationsPage';
import { WarehousesPage } from '../components/WarehousesPage';
import { DisposalCommissionsPage } from '../components/DisposalCommissionsPage';
import { InventoryCountPage } from '../components/InventoryCountPage';
import { RegistrarStockPage } from '../components/registrar-stock/registrar-stock-page';
import { EmployeeRelocationPage } from '../components/employee-relocation/employee-relocation-page';
import { WarehouseInventoryPage } from '../components/inventory-count/warehouse-inventory-page';
import { SettingsPage } from '../components/settings/settings-page';
import { getDefaultPathForRole } from './app-routes';
import { ProtectedRoute } from './protected-route';

interface AppRouterProps {
  onLogout: () => void;
}

const RoleDefaultRedirect = () => <Navigate to={getDefaultPathForRole()} replace />;

export const AppRouter = ({ onLogout }: AppRouterProps) => (
  <Layout onLogout={onLogout}>
    <Routes>
      <Route path="/" element={<RoleDefaultRedirect />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute pageId="dashboard">
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/organization"
        element={
          <ProtectedRoute pageId="organization">
            <OrganizationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/locations"
        element={
          <ProtectedRoute pageId="locations">
            <LocationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouses"
        element={
          <ProtectedRoute pageId="warehouses">
            <WarehousesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employees"
        element={
          <ProtectedRoute pageId="employees">
            <EmployeesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/categories"
        element={
          <ProtectedRoute pageId="categories">
            <CategoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/equipment"
        element={
          <ProtectedRoute pageId="equipment">
            <EquipmentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/equipment-by-category"
        element={
          <ProtectedRoute pageId="equipment-by-category">
            <EquipmentByCategoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transfers"
        element={
          <ProtectedRoute pageId="transfers">
            <TransfersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/documents"
        element={
          <ProtectedRoute pageId="documents">
            <DocumentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/disposal-commissions"
        element={
          <ProtectedRoute pageId="disposal-commissions">
            <DisposalCommissionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory-count"
        element={
          <ProtectedRoute pageId="inventory-count">
            <InventoryCountPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/registrar-stock"
        element={
          <ProtectedRoute pageId="registrar-stock">
            <RegistrarStockPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/registrar-stock/lots/:lotId"
        element={
          <ProtectedRoute pageId="registrar-stock">
            <RegistrarStockPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employee-relocation"
        element={
          <ProtectedRoute pageId="employee-relocation">
            <EmployeeRelocationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse-inventory"
        element={
          <ProtectedRoute pageId="warehouse-inventory">
            <WarehouseInventoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-equipment"
        element={
          <ProtectedRoute pageId="my-equipment">
            <MyEquipmentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/qr-scanner"
        element={
          <ProtectedRoute pageId="qr-scanner">
            <QRScannerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/user-management"
        element={
          <ProtectedRoute pageId="user-management">
            <UserManagementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute pageId="settings">
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<RoleDefaultRedirect />} />
    </Routes>
  </Layout>
);
