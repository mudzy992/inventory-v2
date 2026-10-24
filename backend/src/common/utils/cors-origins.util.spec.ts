import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCorsOriginPolicy } from './cors-origins.util';

test('uses an explicit origin list when configured', () => {
  assert.deepEqual(
    resolveCorsOriginPolicy('https://app.example, https://admin.example ', true),
    ['https://app.example', 'https://admin.example'],
  );
});

test('allows reflected origins only outside production', () => {
  assert.equal(resolveCorsOriginPolicy(undefined, false), true);
  assert.throws(() => resolveCorsOriginPolicy(undefined, true), /CORS_ORIGIN/);
  assert.throws(() => resolveCorsOriginPolicy(' , ', true), /CORS_ORIGIN/);
  assert.throws(() => resolveCorsOriginPolicy('*', true), /wildcard/);
});
