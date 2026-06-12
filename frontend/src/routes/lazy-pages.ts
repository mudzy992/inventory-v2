import { lazyPage } from './lazy-page';
import { PAGE_LOADERS } from './page-loaders';

export const LazyDashboard = lazyPage(() => PAGE_LOADERS.dashboard(), 'Dashboard');
export const LazyOrganizationPage = lazyPage(() => PAGE_LOADERS.organization(), 'OrganizationPage');
export const LazyLocationsPage = lazyPage(() => PAGE_LOADERS.locations(), 'LocationsPage');
export const LazyWarehousesPage = lazyPage(() => PAGE_LOADERS.warehouses(), 'WarehousesPage');
export const LazyEmployeesPage = lazyPage(() => PAGE_LOADERS.employees(), 'EmployeesPage');
export const LazyCategoriesPage = lazyPage(() => PAGE_LOADERS.categories(), 'CategoriesPage');
export const LazyEquipmentPage = lazyPage(() => PAGE_LOADERS.equipment(), 'EquipmentPage');
export const LazyEquipmentByCategoryPage = lazyPage(
  () => PAGE_LOADERS['equipment-by-category'](),
  'EquipmentByCategoryPage',
);
export const LazyTransfersPage = lazyPage(() => PAGE_LOADERS.transfers(), 'TransfersPage');
export const LazyDocumentsPage = lazyPage(() => PAGE_LOADERS.documents(), 'DocumentsPage');
export const LazyDisposalCommissionsPage = lazyPage(
  () => PAGE_LOADERS['disposal-commissions'](),
  'DisposalCommissionsPage',
);
export const LazyInventoryCountPage = lazyPage(() => PAGE_LOADERS['inventory-count'](), 'InventoryCountPage');
export const LazyRegistrarStockPage = lazyPage(
  () => PAGE_LOADERS['registrar-stock'](),
  'RegistrarStockPage',
);
export const LazyEmployeeRelocationPage = lazyPage(
  () => PAGE_LOADERS['employee-relocation'](),
  'EmployeeRelocationPage',
);
export const LazyWarehouseInventoryPage = lazyPage(
  () => PAGE_LOADERS['warehouse-inventory'](),
  'WarehouseInventoryPage',
);
export const LazyMyEquipmentPage = lazyPage(() => PAGE_LOADERS['my-equipment'](), 'MyEquipmentPage');
export const LazyQRScannerPage = lazyPage(() => PAGE_LOADERS['qr-scanner'](), 'QRScannerPage');
export const LazyUserManagementPage = lazyPage(() => PAGE_LOADERS['user-management'](), 'UserManagementPage');
export const LazySettingsPage = lazyPage(() => PAGE_LOADERS.settings(), 'SettingsPage');
export const LazyPublicEquipmentPage = lazyPage(
  () => import('../components/public-equipment-page'),
  'PublicEquipmentPage',
);
