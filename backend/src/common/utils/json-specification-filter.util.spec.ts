import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSpecificationFieldFilter,
  buildSpecificationJsonPath,
} from './json-specification-filter.util';

describe('json-specification-filter.util', () => {
  it('builds quoted MySQL JSON path for UUID field keys', () => {
    const fieldId = '550e8400-e29b-41d4-a716-446655440000';
    assert.equal(
      buildSpecificationJsonPath(fieldId),
      '$."550e8400-e29b-41d4-a716-446655440000"',
    );
  });

  it('builds JsonFilter with string path for Prisma MySQL connector', () => {
    const fieldId = '550e8400-e29b-41d4-a716-446655440000';
    const filter = buildSpecificationFieldFilter(fieldId, 'SN-12345');
    assert.deepEqual(filter, {
      path: '$."550e8400-e29b-41d4-a716-446655440000"',
      equals: 'SN-12345',
    });
  });
});
