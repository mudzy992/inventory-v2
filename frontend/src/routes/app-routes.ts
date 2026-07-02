import type { PageId } from '../components/page-id';
import type { UserRole } from '../types';
import { isNavPageEnabled } from '../utils/settings-feature.util';
import { canAccessPageForRole, getDefaultPageCandidatesForRole } from './role-page-access';

export const PAGE_PATHS: Record<PageId, string> = {
  dashboard: '/dashboard',
  organization: '/organization',
  locations: '/locations',
  warehouses: '/warehouses',
  employees: '/employees',
  categories: '/categories',
  equipment: '/equipment',
  'equipment-by-category': '/equipment-by-category',
  transfers: '/transfers',
  documents: '/documents',
  'disposal-commissions': '/disposal-commissions',
  'inventory-count': '/inventory-count',
  'registrar-stock': '/registrar-stock',
  'employee-relocation': '/employee-relocation',
  'warehouse-inventory': '/warehouse-inventory',
  'my-equipment': '/my-equipment',
  'qr-scanner': '/qr-scanner',
  'user-management': '/user-management',
  settings: '/settings',
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const pageIdToPath = (pageId: PageId): string => PAGE_PATHS[pageId];

export const registrarStockLotPath = (lotId: string): string =>
  `/registrar-stock/lots/${lotId}`;

export const isEquipmentUuidPath = (segment: string): boolean => UUID_PATTERN.test(segment);

const normalizePathname = (pathname: string): string => {
  const trimmed = pathname.replace(/\/$/, '');
  return trimmed || '/';
};

export const pathToPageId = (pathname: string): PageId | null => {
  const path = normalizePathname(pathname);
  if (path.startsWith('/registrar-stock/lots/')) {
    return 'registrar-stock';
  }
  const equipmentMatch = /^\/equipment\/([^/]+)$/.exec(path);
  if (equipmentMatch && isEquipmentUuidPath(equipmentMatch[1])) {
    return null;
  }
  for (const [pageId, pagePath] of Object.entries(PAGE_PATHS) as [PageId, string][]) {
    if (pagePath === path) {
      return pageId;
    }
  }
  return null;
};

export const resolveDefaultPath = (
  role: UserRole | null | undefined,
  publicSettings: Record<string, string | number | boolean>,
  adminSettings: Record<string, string | number | boolean>,
): string => {
  for (const pageId of getDefaultPageCandidatesForRole(role)) {
    if (!canAccessPageForRole(pageId, role)) {
      continue;
    }
    if (!isNavPageEnabled(pageId, publicSettings, adminSettings)) {
      continue;
    }
    return PAGE_PATHS[pageId];
  }
  return PAGE_PATHS['my-equipment'];
};

export { getDefaultPathForRole } from './role-page-access';

export const isPublicEquipmentPath = (pathname: string): boolean => {
  const path = normalizePathname(pathname);
  const match = /^\/equipment\/([^/]+)$/.exec(path);
  return Boolean(match && isEquipmentUuidPath(match[1]));
};
