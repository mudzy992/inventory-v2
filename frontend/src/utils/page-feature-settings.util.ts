import type { PageId } from '../components/Layout';

/** Mapiranje stranice na registry ključ modula (features.*). */
export const PAGE_FEATURE_SETTING_KEY: Partial<Record<PageId, string>> = {
  dashboard: 'features.dashboard',
  organization: 'features.organization',
  locations: 'features.locations',
  warehouses: 'features.warehouses',
  employees: 'features.employees',
  categories: 'features.categories',
  equipment: 'features.equipment',
  'equipment-by-category': 'features.equipment',
  transfers: 'features.transfers',
  documents: 'features.documents',
  'disposal-commissions': 'features.disposal_commissions',
  'inventory-count': 'features.inventory_count',
  'registrar-stock': 'features.registrar_stock',
  'warehouse-inventory': 'features.warehouse_inventory',
  'my-equipment': 'features.my_equipment',
  'qr-scanner': 'features.qr_scanner',
  'user-management': 'features.user_management',
};

export const getPageFeatureSettingKey = (pageId: PageId): string | undefined =>
  PAGE_FEATURE_SETTING_KEY[pageId];
