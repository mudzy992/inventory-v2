import type { PageId } from '../components/page-id';
import { getCurrentUser, isAdmin, isEvidenticar, isSkladistar } from '../store';
import type { UserRole } from '../types';

export const ADMIN_ONLY_PAGES: PageId[] = ['locations', 'categories', 'settings'];

export const ADMIN_OR_MODERATOR_PAGES: PageId[] = [
  'organization',
  'employees',
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

export const ROLE_PAGE_MATRIX: Record<UserRole, PageId[]> = {
  admin: [
    'dashboard', 'equipment', 'equipment-by-category', 'transfers', 'documents',
    'employees', 'user-management', 'inventory-count', 'disposal-commissions',
    'employee-relocation', 'warehouses', 'warehouse-inventory', 'registrar-stock',
    'my-equipment', 'qr-scanner', 'locations', 'categories', 'settings', 'organization',
  ],
  moderator: [
    'dashboard', 'equipment', 'equipment-by-category', 'transfers', 'documents',
    'employees', 'user-management', 'inventory-count', 'disposal-commissions',
    'employee-relocation', 'warehouses', 'my-equipment', 'qr-scanner', 'organization',
  ],
  evidenticar: [
    'dashboard', 'equipment', 'equipment-by-category', 'transfers', 'documents',
    'employees', 'inventory-count', 'disposal-commissions', 'employee-relocation',
    'registrar-stock', 'my-equipment', 'qr-scanner', 'warehouses',
  ],
  skladistar: [
    'dashboard', 'warehouses', 'warehouse-inventory', 'my-equipment', 'qr-scanner',
  ],
  popis_koordinator: [
    'inventory-count', 'my-equipment', 'qr-scanner',
  ],
  user: [
    'my-equipment', 'qr-scanner',
  ],
};

export const canAccessPageForRole = (pageId: PageId, role: UserRole | null | undefined): boolean => {
  if (!role) return false;
  const allowedPages = ROLE_PAGE_MATRIX[role] ?? [];
  return allowedPages.includes(pageId);
};

export const canAccessPage = (pageId: PageId): boolean =>
  canAccessPageForRole(pageId, getCurrentUser()?.role ?? null);

export const getDefaultPageCandidatesForRole = (role: UserRole | null | undefined): PageId[] => {
  if (!role) {
    return ['my-equipment'];
  }
  if (role === 'admin' || role === 'evidenticar') {
    return ['dashboard', 'my-equipment'];
  }
  if (role === 'skladistar') {
    return ['warehouses', 'warehouse-inventory', 'my-equipment', 'qr-scanner'];
  }
  if (role === 'popis_koordinator') {
    return ['inventory-count', 'my-equipment'];
  }
  if (role === 'moderator') {
    return ['dashboard', 'warehouses', 'my-equipment'];
  }
  return ['my-equipment', 'qr-scanner'];
};

/** @deprecated Prefer resolveDefaultPath with settings for feature-aware routing */
export const getDefaultPathForRole = (): string => {
  if (isAdmin() || isEvidenticar()) {
    return '/dashboard';
  }
  if (isSkladistar()) {
    return '/warehouses';
  }
  return '/my-equipment';
};
