import { apiRequest } from './client';

export interface RelocationPreview {
  employeeId: string;
  fromOrgUnitId: string;
  toOrgUnitId: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  sameWarehouse: boolean;
  assignedCount: number;
  byCategory: Array<{ categoryId: string; categoryName: string; count: number }>;
  warnings: string[];
  requiresAction: boolean;
}

export interface RelocationLine {
  id: string;
  caseId: string;
  equipmentId: string;
  categoryId: string;
  status: string;
  sourceAction?: string | null;
  equipment: {
    id: string;
    inventoryNumber: string;
    catalogItemId?: string | null;
  };
  case: {
    id: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    employee: { id: string; firstName: string; lastName: string };
  };
}

export interface AdminRelocationAlerts {
  missingRegistrars: Array<{
    warehouseId: string;
    warehouseName: string;
    categoryId: string;
    categoryName: string;
  }>;
  openCases: number;
  pendingDest: number;
}

export const previewRelocationApi = (employeeId: string, newOrgUnitId: string) =>
  apiRequest<RelocationPreview>(
    `/employee-relocation/preview?employeeId=${employeeId}&newOrgUnitId=${newOrgUnitId}`,
  );

export const fetchRelocationWorkApi = () =>
  apiRequest<{ sourceLines: RelocationLine[]; destLines: RelocationLine[] }>('/employee-relocation');

export const fetchAdminRelocationAlertsApi = () =>
  apiRequest<AdminRelocationAlerts>('/employee-relocation/admin-alerts');

export const resolveRelocationSourceApi = (lineId: string, action: 'transfer' | 'discharge') =>
  apiRequest(`/employee-relocation/lines/${lineId}/source`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });

export const resolveRelocationDestApi = (lineId: string, action: 'accept' | 'reject') =>
  apiRequest(`/employee-relocation/lines/${lineId}/dest`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
