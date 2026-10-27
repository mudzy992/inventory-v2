import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_TRUST_PROXY_HOPS,
  MAX_TRUST_PROXY_HOPS,
  resolveTrustProxyHops,
} from './trust-proxy.util';

test('defaults to exactly one trusted reverse proxy', () => {
  assert.equal(resolveTrustProxyHops({}), DEFAULT_TRUST_PROXY_HOPS);
  assert.equal(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '  ' }), 1);
});

test('accepts an explicit hop count, including direct exposure (0)', () => {
  assert.equal(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '0' }), 0);
  assert.equal(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '2' }), 2);
  assert.equal(resolveTrustProxyHops({ TRUST_PROXY_HOPS: String(MAX_TRUST_PROXY_HOPS) }), 8);
});

test('rejects malformed or unsafe values instead of silently trusting everything', () => {
  for (const raw of ['true', '-1', '1.5', 'abc', '99', '1,2']) {
    assert.throws(
      () => resolveTrustProxyHops({ TRUST_PROXY_HOPS: raw }),
      /TRUST_PROXY_HOPS/u,
      `expected ${raw} to be rejected`,
    );
  }
});

test('main.ts wires the validated hop count (guards CI static assertions)', () => {
  const candidate = [resolve('src/main.ts'), resolve('backend/src/main.ts')].find(existsSync);
  assert.ok(candidate, 'main.ts must be reachable from repo root or backend/');
  const mainSource = readFileSync(candidate, 'utf8');
  assert.match(mainSource, /app\.set\('trust proxy', resolveTrustProxyHops\(process\.env\)\)/u);
  assert.match(mainSource, /from '\.\/common\/http\/trust-proxy\.util'/u);
  assert.doesNotMatch(mainSource, /app\.set\('trust proxy', 1\)/u);
});
