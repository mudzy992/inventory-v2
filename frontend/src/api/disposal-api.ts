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
  inventoryCommittee?: {
    session?: { id: string; name: string; year: number; status: string };
    warehouse?: { id: string; name: string };
    category?: { id: string; name: string };
  } | null;
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
