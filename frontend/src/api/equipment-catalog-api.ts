import { apiRequest } from './client';
import type { PaginatedListParams, PaginatedResponse } from '../types/pagination';
import { buildListQueryString } from '../types/pagination';

export interface EquipmentCatalogItem {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  isActive: boolean;
  inUseCount?: number;
  category?: { id: string; name: string; parentId?: string | null };
}

export const searchCatalogItemsApi = (params: PaginatedListParams & { categoryId?: string; q?: string }) => {
  const query = buildListQueryString({
    ...params,
    search: params.search ?? params.q,
  });
  return apiRequest<PaginatedResponse<EquipmentCatalogItem>>(
    `/equipment-catalog${query ? `?${query}` : ''}`,
  );
};

export const createCatalogItemApi = (body: {
  code: string;
  name: string;
  categoryId: string;
}) =>
  apiRequest<EquipmentCatalogItem>('/equipment-catalog', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateCatalogItemApi = (
  id: string,
  body: Partial<{ code: string; name: string; categoryId: string; isActive: boolean }>,
) =>
  apiRequest<EquipmentCatalogItem>(`/equipment-catalog/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteCatalogItemApi = (id: string) =>
  apiRequest(`/equipment-catalog/${id}`, { method: 'DELETE' });
