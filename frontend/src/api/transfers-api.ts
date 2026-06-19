import { apiRequest } from './client';
import type { PaginatedListParams, PaginatedResponse } from '../types/pagination';
import { buildListQueryString } from '../types/pagination';
import type { TransferRecord } from '../types';

export interface TransfersListFilters extends PaginatedListParams {
  equipmentId?: string;
  personId?: string;
  warehouseId?: string;
  status?: TransferRecord['status'];
}

const toDateOnly = (value: string | Date): string => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
};

type TransferApiRow = TransferRecord & {
  date: string | Date;
  generatedDocxPath?: string | null;
};

export const mapTransferRow = (row: TransferApiRow): TransferRecord => {
  const { generatedDocxPath, ...rest } = row;
  return {
    ...rest,
    date: toDateOnly(row.date),
    hasGeneratedDocument: row.hasGeneratedDocument ?? Boolean(generatedDocxPath),
  };
};

export const fetchTransfersPageApi = async (params: TransfersListFilters = {}) => {
  const query = buildListQueryString(params);
  const response = await apiRequest<PaginatedResponse<TransferApiRow>>(
    `/transfers${query ? `?${query}` : ''}`,
  );
  return {
    ...response,
    items: response.items.map(mapTransferRow),
  };
};

export const fetchRecentTransfersApi = async (limit = 5) => {
  const params = new URLSearchParams({ limit: String(limit) });
  const rows = await apiRequest<TransferApiRow[]>(`/transfers/recent?${params.toString()}`);
  return rows.map(mapTransferRow);
};
