import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertJwtTtl, JWT_TTL_MULTIPLIERS, JWT_TTL_PATTERN } from './auth-config.util';

test('accepts the documented TTL forms', () => {
  for (const raw of ['1s', '15m', '24h', '7d', '3600s', ' 7d ']) {
    assert.doesNotThrow(() => assertJwtTtl(raw, 'JWT_REFRESH_TTL'), raw);
  }
});

test('N-10: invalid JWT_REFRESH_TTL is fail-closed (no silent 7d fallback)', () => {
  for (const raw of [undefined, '', '7', 'seven-days', '0d', '-1d', '1w', '1.5h', '99999999999d']) {
    assert.throws(
      () => assertJwtTtl(raw, 'JWT_REFRESH_TTL'),
      /JWT_REFRESH_TTL/u,
      `expected ${String(raw)} to be rejected`,
    );
  }
});

test('every supported unit has an exact millisecond multiplier', () => {
  assert.deepEqual(JWT_TTL_MULTIPLIERS, {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  });
  for (const unit of ['s', 'm', 'h', 'd']) {
    assert.ok(JWT_TTL_PATTERN.test(`7${unit}`));
  }
});
