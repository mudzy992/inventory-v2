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

export const buildPaginatedResponse = <T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> => ({
  items,
  meta: {
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  },
});
