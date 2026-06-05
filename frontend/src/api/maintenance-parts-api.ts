import { apiRequest } from './client';

export interface CategoryMaintenanceLinkDto {
  id: string;
  hostCategoryId: string;
  maintenanceCategory: {
    id: string;
    name: string;
    description: string;
    parentId: string | null;
    categoryKind: string;
  };
}

export interface MaintenanceStockLotDto {
  id: string;
  warehouseId: string;
  categoryId: string;
  lotKind: string;
  productName: string;
  quantityReceived: number;
  quantityOnHand: number;
  status: string;
  specifications: Record<string, unknown>;
  entryDate: string;
  category?: { id: string; name: string };
  warehouse?: { id: string; name: string };
}

export interface InstalledPartDto {
  id: string;
  hostEquipmentId: string;
  stockLotId: string | null;
  maintenanceCategoryId: string;
  quantity: number;
  legacySpecs: Record<string, unknown>;
  status: 'active' | 'faulty' | 'removed';
  installedAt: string;
  removedAt: string | null;
  notes: string | null;
  maintenanceCategory?: { id: string; name: string };
  stockLot?: { id: string; productName: string; warehouse?: { name: string } };
}

export interface LinkedHostCategoryDto {
  id: string;
  name: string;
  parentId: string | null;
}

export const fetchLinkedHostCategoriesApi = () =>
  apiRequest<LinkedHostCategoryDto[]>('/maintenance-parts/linked-host-categories');

export const fetchCategoryMaintenanceLinksApi = (hostCategoryId: string) =>
  apiRequest<CategoryMaintenanceLinkDto[]>(
    `/maintenance-parts/category-links/${hostCategoryId}`,
  );

export const setCategoryMaintenanceLinksApi = (
  hostCategoryId: string,
  maintenanceCategoryIds: string[],
) =>
  apiRequest<CategoryMaintenanceLinkDto[]>(
    `/maintenance-parts/category-links/${hostCategoryId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ maintenanceCategoryIds }),
    },
  );

export interface MaintenanceConsumptionRowDto {
  maintenanceCategoryId: string;
  maintenanceCategoryName: string;
  hostCategoryId: string | null;
  hostCategoryName: string | null;
  activeQuantity: number;
  faultyQuantity: number;
  removedQuantity: number;
  installedTotal: number;
}

export const fetchMaintenanceConsumptionSummaryApi = (
  warehouseId: string,
  hostCategoryId?: string,
) => {
  const query = hostCategoryId ? `?hostCategoryId=${encodeURIComponent(hostCategoryId)}` : '';
  return apiRequest<MaintenanceConsumptionRowDto[]>(
    `/maintenance-parts/warehouses/${warehouseId}/consumption-summary${query}`,
  );
};

export const fetchMaintenanceStockLotsApi = (warehouseId: string) =>
  apiRequest<MaintenanceStockLotDto[]>(
    `/maintenance-parts/warehouses/${warehouseId}/stock-lots`,
  );

export const receiveMaintenanceStockLotApi = (
  warehouseId: string,
  body: {
    categoryId: string;
    productName: string;
    quantity: number;
    entryDate: string;
    contractNumber?: string;
    notes?: string;
    legacySpecs?: Record<string, string | number | boolean>;
  },
) =>
  apiRequest<MaintenanceStockLotDto>(
    `/maintenance-parts/warehouses/${warehouseId}/stock-lots`,
    { method: 'POST', body: JSON.stringify(body) },
  );

export const fetchInstalledPartsApi = (equipmentId: string) =>
  apiRequest<InstalledPartDto[]>(`/maintenance-parts/equipment/${equipmentId}/parts`);

export const fetchAvailableMaintenanceLotsApi = (
  equipmentId: string,
  maintenanceCategoryId: string,
) =>
  apiRequest<MaintenanceStockLotDto[]>(
    `/maintenance-parts/equipment/${equipmentId}/available-lots/${maintenanceCategoryId}`,
  );

export const installMaintenancePartApi = (
  equipmentId: string,
  body: {
    stockLotId: string;
    quantity: number;
    legacySpecs?: Record<string, string | number | boolean>;
    notes?: string;
  },
) =>
  apiRequest(`/maintenance-parts/equipment/${equipmentId}/install`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const markInstalledPartFaultyApi = (partId: string, note?: string) =>
  apiRequest<InstalledPartDto>(`/maintenance-parts/parts/${partId}/faulty`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  });

export const removeInstalledPartApi = (partId: string, note?: string) =>
  apiRequest<InstalledPartDto>(`/maintenance-parts/parts/${partId}/remove`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  });

export const replaceInstalledPartApi = (
  partId: string,
  body: {
    stockLotId: string;
    quantity: number;
    legacySpecs?: Record<string, string | number | boolean>;
    notes?: string;
  },
) =>
  apiRequest<InstalledPartDto>(`/maintenance-parts/parts/${partId}/replace`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
