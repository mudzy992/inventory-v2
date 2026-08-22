import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContainsSearchWhere,
  buildOrderBy,
  parsePagination,
  resolveListPageSize,
} from './pagination.util';
import { buildPaginatedResponse } from '../types/paginated-response.type';

describe('pagination.util', () => {
  it('parsePagination clamps page and pageSize', () => {
    const result = parsePagination({ page: 0, pageSize: 500 }, { maxPageSize: 50 });
    assert.equal(result.page, 1);
    assert.equal(result.pageSize, 50);
    assert.equal(result.skip, 0);
    assert.equal(result.take, 50);
  });

  it('buildOrderBy uses whitelist and sortDir', () => {
    const allowed = { name: 'name', createdAt: 'createdAt' };
    assert.deepEqual(buildOrderBy('name', 'desc', allowed, 'id'), { name: 'desc' });
    assert.deepEqual(buildOrderBy(undefined, undefined, allowed, 'id'), { id: 'asc' });
  });

  it('buildContainsSearchWhere returns OR contains', () => {
    assert.equal(buildContainsSearchWhere('', ['name']), undefined);
    assert.deepEqual(buildContainsSearchWhere('abc', ['name', 'code']), {
      OR: [
        { name: { contains: 'abc', mode: 'insensitive' } },
        { code: { contains: 'abc', mode: 'insensitive' } },
      ],
    });
  });

  it('buildPaginatedResponse computes totalPages', () => {
    const res = buildPaginatedResponse(['a'], 26, 2, 25);
    assert.equal(res.meta.totalPages, 2);
    assert.equal(res.meta.page, 2);
  });

  it('resolveListPageSize applies settings defaults and max cap', async () => {
    const settings = {
      getNumberValue: async (key: string, fallback: number) => {
        if (key === 'lists.default_page_size') {
          return 25;
        }
        if (key === 'lists.max_page_size') {
          return 100;
        }
        return fallback;
      },
    };
    const resolved = await resolveListPageSize(undefined, settings);
    assert.equal(resolved.pageSize, 25);
    assert.equal(resolved.maxPageSize, 100);

    const capped = await resolveListPageSize(500, settings);
    assert.equal(capped.pageSize, 100);
  });
});
