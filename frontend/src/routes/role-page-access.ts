import type { PageId } from '../components/page-id';
import { isAdmin, isEvidenticar, isModerator, isPopisKoordinator, isSkladistar } from '../store';

export const ADMIN_ONLY_PAGES: PageId[] = ['locations', 'categories', 'settings'];

export const ADMIN_OR_MODERATOR_PAGES: PageId[] = [
  'organization',
  'employees',
  'warehouses',
  'user-management',
  'inventory-count',
  'disposal-commissions',
  'employee-relocation',
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

export const MODERATOR_READ_PAGES: PageId[] = [
  'dashboard',
  'equipment',
  'equipment-by-category',
  'transfers',
  'documents',
];

export const SKLADISTAR_PAGES: PageId[] = [
  'warehouses',
  'warehouse-inventory',
  'my-equipment',
  'qr-scanner',
];

export const canAccessPage = (pageId: PageId): boolean => {
  const admin = isAdmin();
  const moderator = isModerator();
  const evidenticar = isEvidenticar();
  const skladistar = isSkladistar();
  if (ADMIN_ONLY_PAGES.includes(pageId)) {
    return admin;
  }
  if (moderator) {
    if (ADMIN_OR_MODERATOR_PAGES.includes(pageId) || MODERATOR_READ_PAGES.includes(pageId)) {
      return true;
    }
    if (pageId === 'my-equipment' || pageId === 'qr-scanner') {
      return true;
    }
    return false;
  }
  if (ADMIN_OR_EVIDENTICAR_PAGES.includes(pageId)) {
    return admin || evidenticar;
  }
  if (ADMIN_OR_MODERATOR_PAGES.includes(pageId)) {
    return admin;
  }
  if (ADMIN_OR_EVIDENTICAR_INVENTORY_PAGES.includes(pageId)) {
    return admin || evidenticar || isPopisKoordinator();
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
