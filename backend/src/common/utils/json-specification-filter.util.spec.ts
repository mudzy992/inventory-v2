import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSpecificationFieldFilter,
  buildSpecificationJsonPath,
} from './json-specification-filter.util';

describe('json-specification-filter.util', () => {
  it('builds single-segment JSON path array for UUID field keys', () => {
    const fieldId = '550e8400-e29b-41d4-a716-446655440000';
    assert.deepEqual(buildSpecificationJsonPath(fieldId), [
      '550e8400-e29b-41d4-a716-446655440000',
    ]);
  });

  it('builds JsonFilter with array path for Prisma PostgreSQL connector', () => {
    const fieldId = '550e8400-e29b-41d4-a716-446655440000';
    const filter = buildSpecificationFieldFilter(fieldId, 'SN-12345');
    assert.deepEqual(filter, {
      path: ['550e8400-e29b-41d4-a716-446655440000'],
      equals: 'SN-12345',
    });
  });
});
