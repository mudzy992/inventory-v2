import { apiRequest } from './client';

export interface InventoryWarehouseCommitteeRow {
  id: string;
  sessionId: string;
  warehouseId: string;
  isClosed: boolean;
  warehouse?: { id: string; name: string };
  session?: { id: string; name: string; status: string };
  members?: {
    employeeId: string;
    role: string;
    employee?: { firstName: string; lastName: string };
  }[];
}

export interface InventoryWarehouseScopeItem {
  stockLot: {
    id: string;
    productName: string;
    quantityOnHand: number;
    quantityReceived: number;
    category?: { name: string };
  };
  line: {
    id: string;
    status: string;
    quantityCounted: number;
    note?: string | null;
  } | null;
}

export const fetchMyWarehouseCommitteesApi = () =>
  apiRequest<InventoryWarehouseCommitteeRow[]>('/inventory-warehouse-committees/mine');

export const fetchSessionWarehouseCommitteesApi = (sessionId: string) =>
  apiRequest<InventoryWarehouseCommitteeRow[]>(`/inventory-sessions/${sessionId}/warehouse-committees`);

export const fetchWarehouseCommitteeScopeApi = (committeeId: string) =>
  apiRequest<{ committee: InventoryWarehouseCommitteeRow; items: InventoryWarehouseScopeItem[] }>(
    `/inventory-warehouse-committees/${committeeId}/scope`,
  );

export const recordWarehouseInventoryLineApi = (
  committeeId: string,
  body: {
    stockLotId: string;
    status: 'prisutna' | 'nije_prisutna' | 'ostecena';
    quantityCounted: number;
    note?: string;
  },
) =>
  apiRequest(`/inventory-warehouse-committees/${committeeId}/lines`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const closeWarehouseCommitteeApi = (committeeId: string) =>
  apiRequest(`/inventory-warehouse-committees/${committeeId}/close`, { method: 'PATCH' });
