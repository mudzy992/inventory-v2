import type { Paginated, TransferRecord } from '@/types/models';
import { apiRequest } from './client';
import { buildQuery } from './query';

export const fetchTransfersPageApi = (params: {
  equipmentId?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<TransferRecord>> => apiRequest(`/transfers${buildQuery(params)}`);

export const createTransferApi = (body: Record<string, unknown>): Promise<TransferRecord> =>
  apiRequest('/transfers', { method: 'POST', body: JSON.stringify(body) });
