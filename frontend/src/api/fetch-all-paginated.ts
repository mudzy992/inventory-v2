import type { PaginatedListParams, PaginatedResponse } from '../types/pagination';

export const fetchAllPaginatedItems = async <T>(
  fetchPage: (params: PaginatedListParams) => Promise<PaginatedResponse<T>>,
  pageSize = 100,
): Promise<T[]> => {
  const items: T[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const response = await fetchPage({ page, pageSize });
    items.push(...response.items);
    totalPages = response.meta.totalPages;
    page += 1;
  }
  return items;
};
