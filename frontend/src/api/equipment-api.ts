import { apiRequest } from './client';
import type { PaginatedListParams, PaginatedResponse } from '../types/pagination';
import { buildListQueryString } from '../types/pagination';
import type { Equipment, EquipmentStatus } from '../types';

export interface EquipmentSummary {
  total: number;
  byStatus: Record<EquipmentStatus, number>;
}

export interface EquipmentListFilters extends PaginatedListParams {
  status?: EquipmentStatus;
  categoryId?: string;
  currentHolderId?: string;
  /** UUID lota ili `none` za opremu bez lota */
  stockLotId?: string;
}

export interface EquipmentLotGroup {
  stockLotId: string | null;
  productName: string;
  count: number;
}

const mapEquipmentRow = (row: Equipment & { entryDate: string }): Equipment => ({
  ...row,
  entryDate: typeof row.entryDate === 'string' ? row.entryDate.slice(0, 10) : row.entryDate,
  specifications:
    typeof row.specifications === 'object' && row.specifications !== null
      ? (row.specifications as Record<string, string>)
      : {},
});

export const fetchEquipmentPageApi = async (params: EquipmentListFilters) => {
  const query = buildListQueryString(params);
  const response = await apiRequest<PaginatedResponse<Equipment & { entryDate: string }>>(
    `/equipment${query ? `?${query}` : ''}`,
  );
  return {
    ...response,
    items: response.items.map(mapEquipmentRow),
  };
};

export const fetchEquipmentSummaryApi = (categoryId?: string) => {
  const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
  return apiRequest<EquipmentSummary>(`/equipment/summary${query}`);
};

export const fetchEquipmentLotGroupsApi = (categoryId: string) =>
  apiRequest<EquipmentLotGroup[]>(
    `/equipment/lot-groups?categoryId=${encodeURIComponent(categoryId)}`,
  );

export const fetchEquipmentApi = async (id: string) => {
  const row = await apiRequest<Equipment & { entryDate: string }>(`/equipment/${id}`);
  return mapEquipmentRow(row);
};

export const reactivateEquipmentApi = (id: string, reason: string) =>
  apiRequest<Equipment>(`/equipment/${id}/reactivate`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
