import type { PageId } from '../components/page-id';
import { isAdmin, isEvidenticar, isPopisKoordinator, isSkladistar } from '../store';

export const ADMIN_ONLY_PAGES: PageId[] = [
  'organization',
  'locations',
  'categories',
  'user-management',
  'disposal-commissions',
  'settings',
];

export const ADMIN_OR_EVIDENTICAR_INVENTORY_PAGES: PageId[] = ['inventory-count'];

export const POPIS_KOORDINATOR_PAGES: PageId[] = ['inventory-count'];

export const ADMIN_OR_EVIDENTICAR_PAGES: PageId[] = [
  'dashboard',
  'equipment',
  'equipment-by-category',
  'transfers',
  'documents',
  'employees',
  'registrar-stock',
  'employee-relocation',
];

export const SKLADISTAR_PAGES: PageId[] = [
  'warehouses',
  'warehouse-inventory',
  'my-equipment',
  'qr-scanner',
];

export const canAccessPage = (pageId: PageId): boolean => {
  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const skladistar = isSkladistar();
  if (ADMIN_ONLY_PAGES.includes(pageId)) {
    return admin;
  }
  if (ADMIN_OR_EVIDENTICAR_INVENTORY_PAGES.includes(pageId)) {
    return admin || evidenticar || isPopisKoordinator();
  }
  if (ADMIN_OR_EVIDENTICAR_PAGES.includes(pageId)) {
    return admin || evidenticar;
  }
  if (pageId === 'warehouses') {
    return admin || skladistar;
  }
  if (pageId === 'warehouse-inventory') {
    return skladistar && !admin;
  }
  if (pageId === 'my-equipment' || pageId === 'qr-scanner') {
    return true;
  }
  return false;
};
