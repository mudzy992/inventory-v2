import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { PAGE_PATHS, getDefaultPathForRole } from './app-routes';
import {
  LazyCategoriesPage,
  LazyDashboard,
  LazyDisposalCommissionsPage,
  LazyDocumentsPage,
  LazyEmployeeRelocationPage,
  LazyEmployeesPage,
  LazyEquipmentByCategoryPage,
  LazyEquipmentPage,
  LazyInventoryCountPage,
  LazyLocationsPage,
  LazyMyEquipmentPage,
  LazyOrganizationPage,
  LazyQRScannerPage,
  LazyRegistrarStockPage,
  LazySettingsPage,
  LazyTransfersPage,
  LazyUserManagementPage,
  LazyWarehouseInventoryPage,
  LazyWarehousesPage,
} from './lazy-pages';
import { LazyRoutePage } from './lazy-route-page';
import { NotFoundPage } from '../components/not-found-page';

interface AppRouterProps {
  onLogout: () => void;
}

const RoleDefaultRedirect = () => <Navigate to={getDefaultPathForRole()} replace />;

const APP_ROUTE_DEFINITIONS = [
  { path: PAGE_PATHS.dashboard, pageId: 'dashboard' as const, Page: LazyDashboard },
  { path: PAGE_PATHS.organization, pageId: 'organization' as const, Page: LazyOrganizationPage },
  { path: PAGE_PATHS.locations, pageId: 'locations' as const, Page: LazyLocationsPage },
  { path: PAGE_PATHS.warehouses, pageId: 'warehouses' as const, Page: LazyWarehousesPage },
  { path: PAGE_PATHS.employees, pageId: 'employees' as const, Page: LazyEmployeesPage },
  { path: PAGE_PATHS.categories, pageId: 'categories' as const, Page: LazyCategoriesPage },
  { path: PAGE_PATHS.equipment, pageId: 'equipment' as const, Page: LazyEquipmentPage },
  {
    path: PAGE_PATHS['equipment-by-category'],
    pageId: 'equipment-by-category' as const,
    Page: LazyEquipmentByCategoryPage,
  },
  { path: PAGE_PATHS.transfers, pageId: 'transfers' as const, Page: LazyTransfersPage },
  { path: PAGE_PATHS.documents, pageId: 'documents' as const, Page: LazyDocumentsPage },
  {
    path: PAGE_PATHS['disposal-commissions'],
    pageId: 'disposal-commissions' as const,
    Page: LazyDisposalCommissionsPage,
  },
  { path: PAGE_PATHS['inventory-count'], pageId: 'inventory-count' as const, Page: LazyInventoryCountPage },
  { path: PAGE_PATHS['registrar-stock'], pageId: 'registrar-stock' as const, Page: LazyRegistrarStockPage },
  {
    path: '/registrar-stock/lots/:lotId',
    pageId: 'registrar-stock' as const,
    Page: LazyRegistrarStockPage,
  },
  {
    path: PAGE_PATHS['employee-relocation'],
    pageId: 'employee-relocation' as const,
    Page: LazyEmployeeRelocationPage,
  },
  {
    path: PAGE_PATHS['warehouse-inventory'],
    pageId: 'warehouse-inventory' as const,
    Page: LazyWarehouseInventoryPage,
  },
  { path: PAGE_PATHS['my-equipment'], pageId: 'my-equipment' as const, Page: LazyMyEquipmentPage },
  { path: PAGE_PATHS['qr-scanner'], pageId: 'qr-scanner' as const, Page: LazyQRScannerPage },
  { path: PAGE_PATHS['user-management'], pageId: 'user-management' as const, Page: LazyUserManagementPage },
  { path: PAGE_PATHS.settings, pageId: 'settings' as const, Page: LazySettingsPage },
] as const;

export const AppRouter = ({ onLogout }: AppRouterProps) => (
  <Layout onLogout={onLogout}>
    <Routes>
      <Route path="/" element={<RoleDefaultRedirect />} />
      {APP_ROUTE_DEFINITIONS.map(({ path, pageId, Page }) => (
        <Route
          key={path}
          path={path}
          element={<LazyRoutePage pageId={pageId} Page={Page} />}
        />
      ))}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </Layout>
);
