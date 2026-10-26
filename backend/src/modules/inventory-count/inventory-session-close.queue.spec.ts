import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInventoryCloseJobPayload } from './inventory-session-close.queue';
import { runWithCorrelationId } from '../../common/utils/correlation-id.util';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

test('inventory close payload reuses the active HTTP correlation ID', () => {
  const payload = runWithCorrelationId('cid-http', () =>
    buildInventoryCloseJobPayload('session-1'),
  );
  assert.deepEqual(payload, { sessionId: 'session-1', correlationId: 'cid-http' });
});

test('scheduled inventory close recovery still gets a traceable correlation ID', () => {
  const payload = buildInventoryCloseJobPayload('session-2');
  assert.equal(payload.sessionId, 'session-2');
  assert.match(payload.correlationId ?? '', UUID_RE);
});
