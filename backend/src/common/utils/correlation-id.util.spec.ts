import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureCorrelationId,
  getCorrelationId,
  normalizeCorrelationId,
  runWithCorrelationId,
} from './correlation-id.util';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

test('accepts conservative correlation IDs and rejects unsafe header values', () => {
  assert.equal(normalizeCorrelationId('cid-123'), 'cid-123');
  assert.equal(normalizeCorrelationId(' request.42:7 '), 'request.42:7');
  assert.equal(normalizeCorrelationId('bad/../id'), null);
  assert.equal(normalizeCorrelationId('line\nbreak'), null);
  assert.equal(normalizeCorrelationId('x'.repeat(129)), null);
  assert.equal(normalizeCorrelationId(undefined), null);
  assert.equal(normalizeCorrelationId(['cid']), null);
});

test('AsyncLocalStorage exposes the active correlation ID only inside its context', () => {
  assert.equal(getCorrelationId(), undefined);
  const result = runWithCorrelationId('cid-1', () => {
    assert.equal(getCorrelationId(), 'cid-1');
    return 'done';
  });
  assert.equal(result, 'done');
  assert.equal(getCorrelationId(), undefined);
});

test('ensureCorrelationId reuses the request ID or creates a background ID', () => {
  const inside = runWithCorrelationId('cid-http', () => ensureCorrelationId());
  assert.equal(inside, 'cid-http');
  assert.match(ensureCorrelationId(), UUID_RE);
});
