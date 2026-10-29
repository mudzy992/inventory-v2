import type { OrgUnit, Paginated, Warehouse } from '@/types/models';
import { apiRequest } from './client';
import { buildQuery } from './query';

export const fetchOrgUnitsApi = (): Promise<OrgUnit[]> => apiRequest('/org-units');

export const fetchWarehousesApi = async (): Promise<Warehouse[]> => {
  const page = await apiRequest<Paginated<Warehouse>>(
    `/warehouses${buildQuery({ page: 1, pageSize: 100 })}`,
  );
  return page.items ?? [];
};
