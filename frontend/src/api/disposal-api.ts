import { apiRequest } from './client';
import type { PaginatedListParams, PaginatedResponse } from '../types/pagination';
import { buildListQueryString } from '../types/pagination';

export interface DisposalCommissionMemberDto {
  employeeId: string;
  role: string;
  employee?: { id: string; firstName: string; lastName: string; title?: string };
}

export interface DisposalCommissionDto {
  id: string;
  cityId: string;
  name: string;
  isActive: boolean;
  city?: { id: string; name: string; canton?: { name: string } };
  members: DisposalCommissionMemberDto[];
}

export interface DisposalResolveDto {
  cityId: string | null;
  city?: DisposalCommissionDto['city'];
  commission: DisposalCommissionDto | null;
}

export interface DisposalApprovalDto {
  id: string;
  status: string;
  transfer: {
    id: string;
    documentNumber: string;
    equipment?: { inventoryNumber: string };
  };
  votes: { userId: string; approved: boolean }[];
}

export const fetchDisposalCommissionsPageApi = (
  params: PaginatedListParams & { cityId?: string } = {},
) => {
  const query = buildListQueryString(params);
  return apiRequest<PaginatedResponse<DisposalCommissionDto>>(
    `/disposal-commissions${query ? `?${query}` : ''}`,
  );
};

/** @deprecated Use fetchDisposalCommissionsPageApi */
export const fetchDisposalCommissionsApi = async (cityId?: string) => {
  const response = await fetchDisposalCommissionsPageApi({ cityId, page: 1, pageSize: 100 });
  return response.items;
};

export const resolveDisposalCommissionApi = (equipmentId: string) =>
  apiRequest<DisposalResolveDto>(`/disposal-commissions/resolve?equipmentId=${equipmentId}`);

export const fetchPendingDisposalApprovalsApi = () =>
  apiRequest<DisposalApprovalDto[]>('/disposal-commissions/approvals/pending');

export const createDisposalCommissionApi = (body: {
  cityId: string;
  name: string;
  members: { employeeId: string; role: 'predsjednik' | 'clan' }[];
}) => apiRequest('/disposal-commissions', { method: 'POST', body: JSON.stringify(body) });

export const voteDisposalApprovalApi = (approvalId: string, approved: boolean, note?: string) =>
  apiRequest(`/disposal-commissions/approvals/${approvalId}/vote`, {
    method: 'PATCH',
    body: JSON.stringify({ approved, note }),
  });
