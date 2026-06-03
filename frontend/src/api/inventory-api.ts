import { apiRequest } from './client';

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
  role: string;
  employee?: { id: string; firstName: string; lastName: string; title?: string };
}

export interface InventoryCommitteeDto {
  id: string;
  sessionId: string;
  categoryId: string;
  name?: string | null;
  disposalCommissionId?: string | null;
  isClosed?: boolean;
  closedAt?: string | null;
  closedByUserId?: string | null;
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
  specifications: Record<string, string>;
  category?: { name: string };
  currentHolder?: { id: string; firstName: string; lastName: string; title: string; orgUnitId: string };
  warehouse?: { id: string; name: string; cityId: string };
}

export interface InventoryPrintScopeDto {
  committee: InventoryCommitteeDto;
  equipment: PrintScopeEquipmentDto[];
}

export const fetchInventoryCommitteesApi = (sessionId: string) =>
  apiRequest<InventoryCommitteeDto[]>(`/inventory-sessions/${sessionId}/committees`);

export const createInventoryCommitteeApi = (
  sessionId: string,
  body: {
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

export const fetchInventorySessionsApi = (orgUnitId?: string) => {
  const query = orgUnitId ? `?orgUnitId=${orgUnitId}` : '';
  return apiRequest<InventorySessionDto[]>(`/inventory-sessions${query}`);
};

export interface InventoryFreezeBannerSessionDto {
  id: string;
  name: string;
  year: number;
  orgUnitName: string;
  cityName: string | null;
}

export const fetchInventoryFreezeBannerApi = () =>
  apiRequest<{ activeSessions: InventoryFreezeBannerSessionDto[] }>(
    '/inventory-sessions/freeze-banner',
  );

export const createInventorySessionApi = (body: {
  name: string;
  orgUnitId: string;
  year: number;
}) => apiRequest<InventorySessionDto>('/inventory-sessions', { method: 'POST', body: JSON.stringify(body) });

export const activateInventorySessionApi = (id: string) =>
  apiRequest<InventorySessionDto>(`/inventory-sessions/${id}/activate`, { method: 'PATCH' });

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

export const fetchDisposalReportApi = (sessionId: string) =>
  apiRequest<DisposalReportDto>(`/inventory-sessions/${sessionId}/disposal-report`);
