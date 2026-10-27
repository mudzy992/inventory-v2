import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { RECOVERY_MATRIX, checkRecoveryContract } from './check-queue-recovery-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ci = () => readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const pkg = () => readFileSync(resolve(root, 'backend/package.json'), 'utf8');

test('the real repository satisfies every row of the recovery matrix', () => {
  const result = checkRecoveryContract(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.checked, 9);
});

test('the matrix covers all critical crash points exactly once', () => {
  const ids = RECOVERY_MATRIX.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const expected of [
    'inventory-close-enqueue',
    'inventory-close-lease',
    'inventory-close-manual-retry',
    'document-job-enqueue',
    'document-job-stuck',
    'document-job-terminal-outbox',
    'document-event-race',
    'transfer-docx',
    'notification-outbox',
  ]) {
    assert.ok(ids.includes(expected), `missing crash point ${expected}`);
  }
  for (const row of RECOVERY_MATRIX) {
    assert.ok(row.flow && row.crashPoint && row.stuckState);
    assert.ok(row.recoverer && row.source && row.symbols.length >= 2);
    assert.ok(row.idempotency && row.check && row.ciStep);
  }
});

test('mutation: removing a CI step is detected', () => {
  const broken = ci().replace('Verify concurrent inventory close reconcilers', 'Removed during mutation');
  const result = checkRecoveryContract(root, { ci: broken });
  assert.ok(result.errors.some((error) => error.includes('inventory-close-enqueue')));
});

test('mutation: an unwired npm script is detected', () => {
  const broken = ci().replace(
    'npm run test:integration:document-job-stale-recovery',
    'npm run test:integration:settings-defaults',
  );
  const result = checkRecoveryContract(root, { ci: broken });
  assert.ok(result.errors.some((error) => error.includes('document-job-stuck')));
});

test('mutation: deleting an npm script is detected', () => {
  const scripts = JSON.parse(pkg()).scripts;
  delete scripts['test:integration:document-job-stale-recovery'];
  const result = checkRecoveryContract(root, {
    packageJson: JSON.stringify({ scripts }),
  });
  assert.ok(result.errors.some((error) => error.includes('no npm script runs')));
});

test('mutation: removing a recoverer symbol is detected', () => {
  const source = 'backend/src/modules/documents/document-job-recovery-policy.util.ts';
  const original = readFileSync(resolve(root, source), 'utf8');
  const result = checkRecoveryContract(root, {
    sources: { [source]: original.replaceAll('decideStaleRecovery', 'renamedHelper') },
  });
  assert.ok(result.errors.some((error) => error.includes('document-job-stuck')));
});

test('mutation: dropping the bounded stale recovery from reconcileStaleJobs is detected', () => {
  const source = 'backend/src/modules/documents/document-conversion-events.service.ts';
  const original = readFileSync(resolve(root, source), 'utf8');
  const result = checkRecoveryContract(root, {
    sources: { [source]: original.replace("decision === 'stuck'", 'decision === 1') },
  });
  assert.ok(result.errors.some((error) => error.includes("decision === 'stuck'")));
});

test('mutation: removing the stale bound from compose is detected', () => {
  const source = 'docker-compose.yml';
  const original = readFileSync(resolve(root, source), 'utf8');
  const result = checkRecoveryContract(root, {
    sources: { [source]: original.replaceAll('DOCUMENT_JOB_STALE_TIMEOUT_MS', 'REMOVED_KNOB') },
  });
  assert.ok(result.errors.some((error) => error.includes('stale-bound')));
});
