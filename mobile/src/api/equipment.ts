import type { Equipment, Paginated, PublicEquipment } from '@/types/models';
import { apiRequest } from './client';
import { buildQuery } from './query';

export const fetchEquipmentPageApi = (params: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<Equipment>> => apiRequest(`/equipment${buildQuery(params)}`);

export const fetchEquipmentApi = (id: string): Promise<Equipment> =>
  apiRequest<Equipment>(`/equipment/${id}`);

export const fetchPublicEquipmentApi = (id: string): Promise<PublicEquipment> =>
  apiRequest<PublicEquipment>(`/public/equipment/${id}`);
