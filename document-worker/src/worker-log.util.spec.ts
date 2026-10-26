import assert from 'node:assert/strict';
import test from 'node:test';
import { formatJobCorrelation } from './worker-log.util';

test('formats a job correlation ID without exposing job payloads', () => {
  assert.equal(formatJobCorrelation({ correlationId: 'cid-123' }), 'correlationId=cid-123');
});

test('uses a safe placeholder for legacy or stalled jobs without metadata', () => {
  assert.equal(formatJobCorrelation({}), 'correlationId=unknown');
  assert.equal(formatJobCorrelation(null), 'correlationId=unknown');
  assert.equal(formatJobCorrelation(undefined), 'correlationId=unknown');
});
