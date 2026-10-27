import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ArgumentMetadata } from '@nestjs/common';
import { UuidParamPipe } from './uuid-param.pipe';

const UUID = '4f4cc4c0-3a4e-4a85-bd43-c6f0e1e8f3f5';
const pipe = new UuidParamPipe();
const meta = (data: string, type: ArgumentMetadata['type'] = 'param'): ArgumentMetadata => ({
  type,
  data,
  metatype: String,
});

test('accepts a real UUID for id / *Id path params (N-9)', () => {
  for (const data of ['id', 'equipmentId', 'warehouseId', 'approvalId', 'templateId']) {
    assert.equal(pipe.transform(UUID, meta(data)), UUID);
  }
});

test('rejects malformed UUID path params with a 400 instead of a Prisma driver error', () => {
  for (const bad of ['1', 'abc', '../../etc/passwd', UUID.slice(0, -1) + 'g', '']) {
    assert.throws(
      () => pipe.transform(bad, meta('id')),
      /must be a UUID/u,
      `expected ${JSON.stringify(bad)} to be rejected`,
    );
  }
});

test('leaves non-id params, bodies and queries to the ValidationPipe', () => {
  assert.equal(pipe.transform('features.inventory_count', meta('key')), 'features.inventory_count');
  assert.equal(pipe.transform('not-a-uuid', meta('id', 'query')), 'not-a-uuid');
  const body = { year: 2026 };
  assert.equal(pipe.transform(body, meta(undefined as unknown as string, 'body')), body);
});
