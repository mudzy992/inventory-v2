import { apiRequest } from './client';
import { fetchAllPaginatedItems } from './fetch-all-paginated';
import type { PaginatedListParams, PaginatedResponse } from '../types/pagination';
import { buildListQueryString } from '../types/pagination';
import type { WarehouseStockLot } from '../types';

export interface StockLotProductGroup {
  groupKey: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  catalogItemId: string | null;
  warehouseCount: number;
  totalOnHand: number;
  totalReceived: number;
  awaitingSpecCount: number;
  readyToIssueCount: number;
}

export interface AssignedStockLotsListParams extends PaginatedListParams {
  warehouseId?: string;
  categoryId?: string;
  status?: string;
  groupKey?: string;
}

export const fetchWarehouseStockLotsPageApi = (
  warehouseId: string,
  params: PaginatedListParams = {},
) => {
  const query = buildListQueryString(params);
  return apiRequest<PaginatedResponse<WarehouseStockLot>>(
    `/warehouses/${warehouseId}/stock-lots${query ? `?${query}` : ''}`,
  );
};

export const fetchAssignedStockLotsPageApi = (params: AssignedStockLotsListParams = {}) => {
  const query = buildListQueryString(params);
  return apiRequest<PaginatedResponse<WarehouseStockLot>>(
    `/warehouse-stock/assigned${query ? `?${query}` : ''}`,
  );
};

export const fetchAssignedStockLotGroupsPageApi = (params: AssignedStockLotsListParams = {}) => {
  const query = buildListQueryString(params);
  return apiRequest<PaginatedResponse<StockLotProductGroup>>(
    `/warehouse-stock/assigned/groups${query ? `?${query}` : ''}`,
  );
};

/** @deprecated Use paginated fetchWarehouseStockLotsPageApi */
export const fetchWarehouseStockLotsApi = (warehouseId: string) =>
  fetchAllPaginatedItems((params) => fetchWarehouseStockLotsPageApi(warehouseId, params));

/** @deprecated Use paginated fetchAssignedStockLotsPageApi */
export const fetchAssignedStockLotsApi = async () => {
  const response = await fetchAssignedStockLotsPageApi({ page: 1, pageSize: 100 });
  return response.items;
};

export const fetchStockLotApi = (id: string) =>
  apiRequest<WarehouseStockLot>(`/stock-lots/${id}`);

export const createStockLotApi = (warehouseId: string, body: Record<string, unknown>) =>
  apiRequest<WarehouseStockLot>(`/warehouses/${warehouseId}/stock-lots`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const bulkCreateStockLotsApi = (
  warehouseId: string,
  body: {
    items: Array<{
      categoryId: string;
      catalogItemId: string;
      quantity: number;
      entryDate: string;
      contractNumber?: string;
    }>;
  },
) =>
  apiRequest<WarehouseStockLot[]>(`/warehouses/${warehouseId}/stock-lots/bulk`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateStockLotSpecApi = (id: string, specifications: Record<string, string>) =>
  apiRequest<WarehouseStockLot>(`/stock-lots/${id}/specifications`, {
    method: 'PATCH',
    body: JSON.stringify({ specifications }),
  });

export const issueStockLotUnitApi = (
  id: string,
  body: {
    employeeId: string;
    inventoryNumber: string;
    uniqueSpecifications: Record<string, string>;
    date?: string;
    signerId?: string;
  },
) =>
  apiRequest<WarehouseStockLot>(`/stock-lots/${id}/issue`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
