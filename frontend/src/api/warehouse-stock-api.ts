import { apiRequest } from './client';
import type { WarehouseStockLot } from '../types';

export const fetchWarehouseStockLotsApi = (warehouseId: string) =>
  apiRequest<WarehouseStockLot[]>(`/warehouses/${warehouseId}/stock-lots`);

export const fetchAssignedStockLotsApi = () =>
  apiRequest<WarehouseStockLot[]>('/warehouse-stock/assigned');

export const fetchStockLotApi = (id: string) =>
  apiRequest<WarehouseStockLot>(`/stock-lots/${id}`);

export const createStockLotApi = (warehouseId: string, body: Record<string, unknown>) =>
  apiRequest<WarehouseStockLot>(`/warehouses/${warehouseId}/stock-lots`, {
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
