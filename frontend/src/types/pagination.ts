export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface PaginatedListParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  search?: string;
  [key: string]: string | number | undefined;
}

export const buildListQueryString = (params: PaginatedListParams): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  return search.toString();
};
