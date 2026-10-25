import { apiRequest } from './client';
import type { Equipment } from '../types';
import type { PaginatedListParams, PaginatedResponse } from '../types/pagination';
import { buildListQueryString } from '../types/pagination';

export type InventoryLineStatus =
  | 'prisutna'
  | 'ostecena'
  | 'promjena_lokacije'
  | 'nije_prisutna'
  | 'predlozen_rashod';
export type InventoryRelocationTarget = 'skladiste' | 'osoba';
export type InventorySessionStatus = 'draft' | 'active' | 'closing' | 'closed';

export interface OrgUnitDto {
  id: string;
  name: string;
  type: string;
  effectiveLocationCityId?: string | null;
  effectiveLocationCity?: { id: string; name: string; canton?: { name: string } };
}

export interface InventoryCommitteeMemberDto {
  employeeId: string;
  role: 'predsjednik' | 'clan';
  employee?: { id: string; firstName: string; lastName: string; title?: string };
}

export interface InventoryCommitteeDto {
  id: string;
  sessionId: string;
  _count?: { lines: number };
  warehouseId?: string | null;
  categoryId: string;
  name?: string | null;
  membersConfigured?: boolean;
  disposalCommissionId?: string | null;
  isClosed?: boolean;
  closedAt?: string | null;
  closedByUserId?: string | null;
  warehouse?: { id: string; name: string };
  category?: { id: string; name: string };
  session?: {
    id: string;
    name: string;
    year: number;
    status: InventorySessionStatus;
    orgUnitId: string;
    orgUnit?: OrgUnitDto;
  };
  members: InventoryCommitteeMemberDto[];
  lines?: InventoryLineDto[];
  disposalCommission?: {
    id: string;
    name: string;
    members: InventoryCommitteeMemberDto[];
  };
}

export interface InventoryLineDto {
  id: string;
  committeeId: string;
  equipmentId: string;
  status: InventoryLineStatus;
  note?: string | null;
  relocationTargetType?: InventoryRelocationTarget | null;
  relocationWarehouseId?: string | null;
  relocationToPersonId?: string | null;
  pendingAction?: {
    id: string;
    kind: string;
    status: 'pending' | 'running' | 'applied' | 'failed' | 'skipped';
    lastError?: string | null;
  } | null;
  equipment?: {
    id: string;
    inventoryNumber: string;
    categoryId: string;
    status: string;
    category?: { name: string };
    currentHolder?: { firstName: string; lastName: string };
  };
  generatedTransfer?: {
    id: string;
    status: string;
    documentNumber: string;
    scannedDocUrl?: string | null;
  } | null;
}

export interface InventorySessionCloseJobDto {
  id: string;
  sessionId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  totalCount: number;
  appliedCount: number;
  failedCount: number;
  skippedCount: number;
  remaining?: number;
  startedAt?: string | null;
  endedAt?: string | null;
  lastError?: string | null;
}

export interface InventorySessionDto {
  id: string;
  name: string;
  _count?: { committees: number };
  orgUnitId: string;
  year: number;
  startDate?: string | null;
  endDate?: string | null;
  status: InventorySessionStatus;
  closedAt?: string | null;
  orgUnit?: OrgUnitDto;
  committees?: (InventoryCommitteeDto & { lines?: InventoryLineDto[] })[];
}

export interface PrintScopeEquipmentDto {
  id: string;
  inventoryNumber: string;
  categoryId: string;
  status: string;
  affiliation: Equipment['affiliation'];
  isAccountingTracked: boolean;
  specifications: Record<string, string>;
  category?: { name: string };
  currentHolder?: { id: string; firstName: string; lastName: string; title: string; orgUnitId: string };
  warehouse?: { id: string; name: string; cityId: string };
  stockLot?: { id: string; productName: string } | null;
}

export interface InventoryPrintScopeDto {
  committee: InventoryCommitteeDto;
  equipment: PrintScopeEquipmentDto[];
}

export const fetchInventorySessionsPageApi = (
  params: PaginatedListParams & { orgUnitId?: string } = {},
) => {
  const query = buildListQueryString(params);
  return apiRequest<PaginatedResponse<InventorySessionDto>>(
    `/inventory-count/sessions${query ? `?${query}` : ''}`,
  );
};

export const fetchInventoryCommitteesPageApi = (
  sessionId: string,
  params: PaginatedListParams = {},
) => {
  const query = buildListQueryString(params);
  return apiRequest<PaginatedResponse<InventoryCommitteeDto>>(
    `/inventory-count/sessions/${sessionId}/committees${query ? `?${query}` : ''}`,
  );
};

export const fetchInventoryLinesPageApi = (
  committeeId: string,
  params: PaginatedListParams = {},
) => {
  const query = buildListQueryString(params);
  return apiRequest<PaginatedResponse<InventoryLineDto>>(
    `/inventory-count/committees/${committeeId}/lines${query ? `?${query}` : ''}`,
  );
};

export const fetchInventoryEquipmentScopePageApi = (
  committeeId: string,
  params: PaginatedListParams = {},
) => {
  const query = buildListQueryString(params);
  return apiRequest<PaginatedResponse<PrintScopeEquipmentDto>>(
    `/inventory-count/committees/${committeeId}/equipment-scope${query ? `?${query}` : ''}`,
  );
};

export const fetchInventoryCommitteesApi = (sessionId: string) =>
  apiRequest<InventoryCommitteeDto[]>(`/inventory-sessions/${sessionId}/committees`);

export interface InventorySessionWarehouseDto {
  id: string;
  name: string;
}

export interface CommitteeSetupOptionsDto {
  warehouse: { id: string; name: string };
  categories: {
    id: string;
    name: string;
    equipmentCount: number;
    alreadyAssigned: boolean;
  }[];
  eligibleEmployees: {
    id: string;
    firstName: string;
    lastName: string;
    title: string;
    hasUserAccount: boolean;
  }[];
}

export const fetchSessionWarehousesApi = (sessionId: string) =>
  apiRequest<InventorySessionWarehouseDto[]>(`/inventory-sessions/${sessionId}/session-warehouses`);

export const fetchCommitteeSetupOptionsApi = (
  sessionId: string,
  warehouseId: string,
  excludeCommitteeId?: string,
) => {
  const params = new URLSearchParams({ warehouseId });
  if (excludeCommitteeId) {
    params.set('excludeCommitteeId', excludeCommitteeId);
  }
  return apiRequest<CommitteeSetupOptionsDto>(
    `/inventory-sessions/${sessionId}/committees/setup-options?${params.toString()}`,
  );
};

export const createInventoryCommitteeApi = (
  sessionId: string,
  body: {
    warehouseId: string;
    categoryId: string;
    name?: string;
    inventoryMembers: { employeeId: string; role: 'predsjednik' | 'clan' }[];
    disposalMembers: { employeeId: string; role: 'predsjednik' | 'clan' }[];
  },
) =>
  apiRequest<InventoryCommitteeDto>(`/inventory-sessions/${sessionId}/committees`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const fetchInventoryPrintScopeApi = (committeeId: string) =>
  apiRequest<InventoryPrintScopeDto>(`/inventory-sessions/committees/${committeeId}/print-scope`);

export const fetchInventorySessionsApi = async (orgUnitId?: string) => {
  const response = await fetchInventorySessionsPageApi({ orgUnitId, page: 1, pageSize: 100 });
  return response.items;
};

export interface InventoryFreezeBannerSessionDto {
  id: string;
  name: string;
  year: number;
  orgUnitName: string;
  cityName: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  warehouseNames?: string[];
}

export const fetchInventoryFreezeBannerApi = () =>
  apiRequest<{
    activeSessions: InventoryFreezeBannerSessionDto[];
    productionLockSessions: InventoryFreezeBannerSessionDto[];
  }>('/inventory-sessions/freeze-banner');

export const createInventorySessionApi = (body: {
  name: string;
  orgUnitId: string;
  year: number;
}) => apiRequest<InventorySessionDto>('/inventory-sessions', { method: 'POST', body: JSON.stringify(body) });

export const activateInventorySessionApi = (id: string) =>
  apiRequest<InventorySessionDto>(`/inventory-sessions/${id}/activate`, { method: 'PATCH' });

export const reconcileInventorySessionSlotsApi = (sessionId: string) =>
  apiRequest<{ created: number; skipped: number }>(
    `/inventory-sessions/${sessionId}/reconcile-slots`,
    { method: 'POST' },
  );

export const recordInventoryLineApi = (
  committeeId: string,
  body: {
    equipmentId: string;
    status: InventoryLineStatus;
    note?: string;
    relocationTargetType?: InventoryRelocationTarget;
    relocationWarehouseId?: string;
    relocationToPersonId?: string;
  },
) =>
  apiRequest<InventoryLineDto>(`/inventory-sessions/committees/${committeeId}/lines`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const closeInventoryCommitteeApi = (committeeId: string) =>
  apiRequest<InventoryCommitteeDto>(`/inventory-sessions/committees/${committeeId}/close`, { method: 'PATCH' });

export const fetchInventoryCommitteeReportApi = (committeeId: string) =>
  apiRequest<{ committee: InventoryCommitteeDto; groups: { key: string; label: string; items: unknown[] }[] }>(
    `/inventory-sessions/committees/${committeeId}/report`,
  );

export const closeInventorySessionApi = (id: string) =>
  apiRequest<InventorySessionCloseJobDto>(`/inventory-sessions/${id}/close`, { method: 'PATCH' });

export const deleteInventorySessionApi = (id: string) =>
  apiRequest<{ ok: boolean }>(`/inventory-sessions/${id}`, { method: 'DELETE' });

export const updateInventoryCommitteeApi = (
  committeeId: string,
  body: {
    warehouseId: string;
    categoryId: string;
    name?: string;
    inventoryMembers: { employeeId: string; role: 'predsjednik' | 'clan' }[];
    disposalMembers: { employeeId: string; role: 'predsjednik' | 'clan' }[];
  },
) =>
  apiRequest<InventoryCommitteeDto>(`/inventory-sessions/committees/${committeeId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteInventoryCommitteeApi = (committeeId: string) =>
  apiRequest<{ ok: boolean }>(`/inventory-sessions/committees/${committeeId}`, { method: 'DELETE' });

export const fetchInventorySessionCloseJobApi = (id: string) =>
  apiRequest<InventorySessionCloseJobDto | null>(`/inventory-sessions/${id}/close-job`);

export interface DisposalInventoryApprovalDto {
  id: string;
  equipmentId: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string | null;
  equipment?: {
    id: string;
    inventoryNumber: string;
    category?: { name: string };
    warehouse?: { name: string };
  };
}

export const fetchDisposalInboxApi = (sessionId: string) =>
  apiRequest<DisposalInventoryApprovalDto[]>(`/inventory-sessions/${sessionId}/disposal-inbox`);

export const reviewDisposalApprovalApi = (
  approvalId: string,
  body: { approved: boolean; note?: string },
) =>
  apiRequest<DisposalInventoryApprovalDto>(`/inventory-sessions/disposal-approvals/${approvalId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const fetchInventorySessionReportApi = (sessionId: string) =>
  apiRequest<unknown>(`/inventory-sessions/${sessionId}/report`);

export interface DisposalReportItemDto {
  id: string;
  status: string;
  inventoryNumber: string;
  categoryName: string | null;
  warehouseName: string | null;
  lineStatus: string | null;
  lineNote: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByUsername: string | null;
  commissionName: string;
  commissionCategoryName: string | null;
  source?: 'registrar_list' | 'inventory_line';
}

export interface DisposalReportDto {
  session: {
    id: string;
    name: string;
    year: number;
    status: string;
    closedAt: string | null;
    orgUnitName: string | null;
  };
  summary: { pending: number; approved: number; rejected: number; total: number };
  commissions: {
    id: string;
    name: string;
    cityName: string | null;
    categoryName: string | null;
    presidentName: string | null;
    memberNames: string[];
  }[];
  items: {
    pending: DisposalReportItemDto[];
    approved: DisposalReportItemDto[];
    rejected: DisposalReportItemDto[];
  };
}

export interface EquipmentDisposalListItemDto {
  id: string;
  sessionId: string;
  equipmentId: string;
  warehouseId: string;
  categoryId: string;
  status: 'listed' | 'withdrawn' | 'assigned' | 'approved' | 'rejected';
  note?: string | null;
  markedAt: string;
  equipment?: {
    id: string;
    inventoryNumber: string;
    status: string;
    category?: { id: string; name: string };
    warehouse?: { id: string; name: string };
    currentHolder?: { id: string; firstName: string; lastName: string };
  };
  warehouse?: { id: string; name: string };
  category?: { id: string; name: string };
  markedByUser?: { id: string; username: string };
  razduzenjeTransfer?: { id: string; status: string; documentNumber: string } | null;
  disposalCommission?: { id: string; name: string } | null;
}

export const fetchDisposalListApi = (sessionId: string) =>
  apiRequest<EquipmentDisposalListItemDto[]>(`/inventory-sessions/${sessionId}/disposal-list`);

export const fetchEligibleDisposalSessionsApi = (equipmentId: string) =>
  apiRequest<Pick<InventorySessionDto, 'id' | 'name' | 'year' | 'status' | 'orgUnitId' | 'orgUnit'>[]>(
    `/inventory-sessions/eligible-for-equipment/${equipmentId}`,
  );

export const markDisposalListApi = (
  sessionId: string,
  body: { equipmentId: string; note?: string },
) =>
  apiRequest<EquipmentDisposalListItemDto>(`/inventory-sessions/${sessionId}/disposal-list`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const withdrawDisposalListApi = (
  sessionId: string,
  equipmentId: string,
  body?: { note?: string },
) =>
  apiRequest<EquipmentDisposalListItemDto>(
    `/inventory-sessions/${sessionId}/disposal-list/${equipmentId}`,
    { method: 'DELETE', body: JSON.stringify(body ?? {}) },
  );

export const fetchDisposalReportApi = (sessionId: string) =>
  apiRequest<DisposalReportDto>(`/inventory-sessions/${sessionId}/disposal-report`);
