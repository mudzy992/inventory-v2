import type { PageId } from '../components/page-id';

export const PAGE_LOADERS: Record<PageId, () => Promise<object>> = {
  dashboard: () => import('../components/Dashboard'),
  organization: () => import('../components/OrganizationPage'),
  locations: () => import('../components/LocationsPage'),
  warehouses: () => import('../components/WarehousesPage'),
  employees: () => import('../components/EmployeesPage'),
  categories: () => import('../components/CategoriesPage'),
  equipment: () => import('../components/EquipmentPage'),
  'equipment-by-category': () => import('../components/EquipmentByCategoryPage'),
  transfers: () => import('../components/TransfersPage'),
  documents: () => import('../components/DocumentsPage'),
  'disposal-commissions': () => import('../components/DisposalCommissionsPage'),
  'inventory-count': () => import('../components/InventoryCountPage'),
  'registrar-stock': () => import('../components/registrar-stock/registrar-stock-page'),
  'employee-relocation': () => import('../components/employee-relocation/employee-relocation-page'),
  'warehouse-inventory': () => import('../components/inventory-count/warehouse-inventory-page'),
  'my-equipment': () => import('../components/MyEquipmentPage'),
  'qr-scanner': () => import('../components/QRScannerPage'),
  'user-management': () => import('../components/UserManagementPage'),
  settings: () => import('../components/settings/settings-page'),
};

const prefetchedPages = new Set<PageId>();

export const prefetchPage = (pageId: PageId): void => {
  if (prefetchedPages.has(pageId)) {
    return;
  }
  prefetchedPages.add(pageId);
  void PAGE_LOADERS[pageId]();
};

export const prefetchPublicEquipmentPage = (): void => {
  void import('../components/public-equipment-page');
};
