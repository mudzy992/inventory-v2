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

export const canAccessPageForRole = (pageId: PageId, role: UserRole | null | undefined): boolean => {
  const admin = role === 'admin';
  const moderator = role === 'moderator';
  const evidenticar = role === 'evidenticar';
  const skladistar = role === 'skladistar';
  const coordinator = role === 'popis_koordinator';
  if (ADMIN_ONLY_PAGES.includes(pageId)) {
    return admin;
  }
  if (pageId === 'warehouses') {
    return admin || skladistar || moderator;
  }
  if (pageId === 'warehouse-inventory') {
    return skladistar && !admin;
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
  if (ADMIN_OR_EVIDENTICAR_INVENTORY_PAGES.includes(pageId)) {
    return admin || evidenticar || coordinator;
  }
  if (ADMIN_OR_MODERATOR_PAGES.includes(pageId)) {
    return admin;
  }
  if (pageId === 'my-equipment' || pageId === 'qr-scanner') {
    return true;
  }
  return false;
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
