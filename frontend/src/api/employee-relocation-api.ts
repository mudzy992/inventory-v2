import { apiRequest } from './client';
import type { PaginatedListParams, PaginatedResponse } from '../types/pagination';
import { buildListQueryString } from '../types/pagination';

export interface RelocationPreview {
  employeeId: string;
  fromOrgUnitId: string;
  toOrgUnitId: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  sameWarehouse: boolean;
  assignedCount: number;
  byCategory: Array<{ categoryId: string; categoryName: string; count: number }>;
  unmappedEquipment: Array<{
    equipmentId: string;
    inventoryNumber: string;
    categoryId: string;
    categoryName: string;
  }>;
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
    stockLot?: { catalogItemId?: string | null; productName?: string | null } | null;
    catalogItem?: { id: string; code: string; name: string } | null;
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
  unmappedCatalogLines: number;
}

export const previewRelocationApi = (employeeId: string, newOrgUnitId: string) =>
  apiRequest<RelocationPreview>(
    `/employee-relocation/preview?employeeId=${employeeId}&newOrgUnitId=${newOrgUnitId}`,
  );

export interface RelocationListResponse {
  sourceLines: PaginatedResponse<RelocationLine>;
  destLines: PaginatedResponse<RelocationLine>;
  openCases: PaginatedResponse<{
    id: string;
    status: string;
    employee: { id: string; firstName: string; lastName: string };
    lines: RelocationLine[];
  }>;
}

export const fetchRelocationWorkPageApi = (params: PaginatedListParams = {}) => {
  const query = buildListQueryString(params);
  return apiRequest<RelocationListResponse>(
    `/employee-relocation${query ? `?${query}` : ''}`,
  );
};

/** @deprecated Use fetchRelocationWorkPageApi */
export const fetchRelocationWorkApi = async () => {
  const response = await fetchRelocationWorkPageApi({ page: 1, pageSize: 100 });
  return {
    sourceLines: response.sourceLines.items,
    destLines: response.destLines.items,
  };
};

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

export const mapRelocationLineCatalogApi = (lineId: string, catalogItemId: string) =>
  apiRequest<RelocationLine>(`/employee-relocation/lines/${lineId}/map-catalog`, {
    method: 'PATCH',
    body: JSON.stringify({ catalogItemId }),
  });
