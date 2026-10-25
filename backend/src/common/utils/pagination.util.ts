import { BadRequestException } from '@nestjs/common';
import type { PaginatedQueryDto } from '../dto/paginated-query.dto';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../dto/paginated-query.dto';
import { buildPaginatedResponse, type PaginatedResponse } from '../types/paginated-response.type';

export const MAX_PAGE_OFFSET = 100_000;

export interface ParsedPagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

const calculatePageSkip = (page: number, pageSize: number): number => {
  const skip = (page - 1) * pageSize;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    !Number.isSafeInteger(skip) ||
    skip > MAX_PAGE_OFFSET
  ) {
    throw new BadRequestException(
      `Requested page exceeds the maximum offset of ${MAX_PAGE_OFFSET}. Reduce the page number or narrow the results.`,
    );
  }
  return skip;
};

export const parsePagination = (
  query: Pick<PaginatedQueryDto, 'page' | 'pageSize'>,
  defaults?: { defaultPageSize?: number; maxPageSize?: number },
): ParsedPagination => {
  const defaultPageSize = defaults?.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = defaults?.maxPageSize ?? MAX_PAGE_SIZE;
  const page = Math.max(1, query.page ?? DEFAULT_PAGE);
  const rawSize = query.pageSize ?? defaultPageSize;
  const pageSize = Math.min(maxPageSize, Math.max(1, rawSize));
  const skip = calculatePageSkip(page, pageSize);
  return {
    page,
    pageSize,
    skip,
    take: pageSize,
  };
};

export const buildOrderBy = (
  sortBy: string | undefined,
  sortDir: 'asc' | 'desc' | undefined,
  allowedFields: Record<string, string>,
  fallbackField: string,
): Record<string, 'asc' | 'desc'> => {
  const field = sortBy && sortBy in allowedFields ? allowedFields[sortBy]! : fallbackField;
  return { [field]: sortDir ?? 'asc' };
};

export const buildContainsSearchWhere = (
  search: string | undefined,
  fields: string[],
): { OR: Record<string, { contains: string; mode: 'insensitive' }>[] } | undefined => {
  const term = search?.trim();
  if (!term || fields.length === 0) {
    return undefined;
  }
  return {
    OR: fields.map((field) => ({ [field]: { contains: term, mode: 'insensitive' as const } })),
  };
};

type PaginateOrderBy =
  | Record<string, 'asc' | 'desc'>
  | Record<string, 'asc' | 'desc'>[];

export interface PaginateArgs<T, W = object> {
  findMany: (args: {
    where?: W;
    orderBy?: PaginateOrderBy;
    skip: number;
    take: number;
  }) => Promise<T[]>;
  count: (args: { where?: W }) => Promise<number>;
  where?: W;
  orderBy?: PaginateOrderBy;
  page: number;
  pageSize: number;
}

export const paginate = async <T, W = object>(
  args: PaginateArgs<T, W>,
): Promise<PaginatedResponse<T>> => {
  const { findMany, count, where, orderBy, page, pageSize } = args;
  const skip = calculatePageSkip(page, pageSize);
  const [items, total] = await Promise.all([
    findMany({ where, orderBy, skip, take: pageSize }),
    count({ where }),
  ]);
  return buildPaginatedResponse(items, total, page, pageSize);
};

export const resolveListPageSize = async (
  queryPageSize: number | undefined,
  settings: { getNumberValue: (key: string, fallback: number) => Promise<number> },
): Promise<{ pageSize: number; maxPageSize: number }> => {
  const [defaultPageSize, maxPageSize] = await Promise.all([
    settings.getNumberValue('lists.default_page_size', DEFAULT_PAGE_SIZE),
    settings.getNumberValue('lists.max_page_size', MAX_PAGE_SIZE),
  ]);
  const cappedMax = Math.max(1, maxPageSize);
  const base = queryPageSize ?? defaultPageSize;
  return {
    maxPageSize: cappedMax,
    pageSize: Math.min(cappedMax, Math.max(1, base)),
  };
};
