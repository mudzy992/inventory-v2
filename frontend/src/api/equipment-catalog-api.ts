import { apiRequest } from './client';

export interface EquipmentCatalogItem {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  isActive: boolean;
  category?: { id: string; name: string; parentId?: string | null };
}

export const searchCatalogItemsApi = (params: { categoryId?: string; q?: string }) => {
  const search = new URLSearchParams();
  if (params.categoryId) {
    search.set('categoryId', params.categoryId);
  }
  if (params.q) {
    search.set('q', params.q);
  }
  const query = search.toString();
  return apiRequest<EquipmentCatalogItem[]>(
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
