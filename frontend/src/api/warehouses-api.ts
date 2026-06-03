import { apiRequest } from './client';
import type { Warehouse } from '../types';

export const fetchWarehousesApi = () => apiRequest<Warehouse[]>('/warehouses');

export const resolveEffectiveWarehouseApi = (orgUnitId: string, cityId?: string) => {
  const params = new URLSearchParams({ orgUnitId });
  if (cityId) {
    params.set('cityId', cityId);
  }
  return apiRequest<{ warehouseId: string | null; warehouse: Warehouse | null }>(
    `/warehouses/resolve/effective?${params.toString()}`,
  );
};

export const createWarehouseApi = (body: Record<string, unknown>) =>
  apiRequest<Warehouse>('/warehouses', { method: 'POST', body: JSON.stringify(body) });

export const updateWarehouseApi = (id: string, body: Record<string, unknown>) =>
  apiRequest<Warehouse>(`/warehouses/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const fetchReadyForDestructionApi = (warehouseId: string) =>
  apiRequest<{ id: string; inventoryNumber: string; warehouseCondition?: string | null }[]>(
    `/warehouses/${warehouseId}/ready-for-destruction`,
  );

export const destroyEquipmentApi = (warehouseId: string, equipmentId: string) =>
  apiRequest(`/warehouses/${warehouseId}/destroy-equipment/${equipmentId}`, { method: 'POST' });
