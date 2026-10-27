import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_DOCUMENT_JOB_STALE_MS,
  DOCUMENT_JOB_STALE_RECOVERY_ERROR,
  MAX_DOCUMENT_JOB_STALE_MS,
  MIN_DOCUMENT_JOB_STALE_MS,
  assertStaleTimeoutAfterWorkerTimeout,
  decideStaleRecovery,
  documentJobAgeMs,
  resolveDocumentJobStaleMs,
  type StaleDocumentJob,
} from './document-job-recovery-policy.util';

const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const job = (overrides: Partial<StaleDocumentJob> = {}): StaleDocumentJob => ({
  status: 'running',
  createdAt: new Date(NOW - 60 * 60 * 1000),
  startedAt: new Date(NOW - 10 * 60 * 1000),
  ...overrides,
});

test('stale timeout parsing is strict and defaults to 30 minutes', () => {
  assert.equal(resolveDocumentJobStaleMs(undefined), DEFAULT_DOCUMENT_JOB_STALE_MS);
  assert.equal(resolveDocumentJobStaleMs('  '), DEFAULT_DOCUMENT_JOB_STALE_MS);
  assert.equal(resolveDocumentJobStaleMs(' 600000 '), 600_000);
  assert.equal(resolveDocumentJobStaleMs(String(MIN_DOCUMENT_JOB_STALE_MS)), MIN_DOCUMENT_JOB_STALE_MS);
  assert.equal(resolveDocumentJobStaleMs(String(MAX_DOCUMENT_JOB_STALE_MS)), MAX_DOCUMENT_JOB_STALE_MS);
  for (const bad of ['0', '299999', '1.5', 'abc', String(MAX_DOCUMENT_JOB_STALE_MS + 1), '-1']) {
    assert.throws(() => resolveDocumentJobStaleMs(bad), /must be an integer between/u);
  }
});

test('age uses startedAt for running jobs and createdAt for queued jobs', () => {
  const running = job();
  assert.equal(documentJobAgeMs(running, NOW), 10 * 60 * 1000);
  assert.equal(documentJobAgeMs(job({ status: 'queued', startedAt: null }), NOW), 60 * 60 * 1000);
  assert.equal(documentJobAgeMs(job({ status: 'running', startedAt: null }), NOW), 60 * 60 * 1000);
});

test('a missing BullMQ job respects the existing grace period', () => {
  const base = { bullJobPresent: false, bullJobState: 'missing', now: NOW, staleMs: 30 * 60 * 1000, missingGraceMs: 60_000 };
  assert.equal(
    decideStaleRecovery({ ...base, job: job({ status: 'queued', createdAt: new Date(NOW - 10_000) }) }),
    'none',
  );
  assert.equal(
    decideStaleRecovery({ ...base, job: job({ status: 'queued', createdAt: new Date(NOW - 61_000) }) }),
    'missing',
  );
});

test('terminal BullMQ states are never declared stuck (existing handlers own them)', () => {
  const old = job({ startedAt: new Date(NOW - 24 * 60 * 60 * 1000) });
  for (const bullJobState of ['completed', 'failed']) {
    assert.equal(
      decideStaleRecovery({ job: old, bullJobPresent: true, bullJobState, now: NOW, staleMs: 30 * 60 * 1000, missingGraceMs: 60_000 }),
      'none',
    );
  }
});

test('fresh waiting/active/delayed jobs keep their owner; stuck ones are recovered', () => {
  const base = { bullJobPresent: true, now: NOW, staleMs: 30 * 60 * 1000, missingGraceMs: 60_000 };
  for (const bullJobState of ['waiting', 'active', 'delayed', 'prioritized', 'paused', 'unknown']) {
    assert.equal(
      decideStaleRecovery({ ...base, bullJobState, job: job({ startedAt: new Date(NOW - 60_000) }) }),
      'none',
      bullJobState,
    );
    assert.equal(
      decideStaleRecovery({ ...base, bullJobState, job: job({ startedAt: new Date(NOW - 31 * 60 * 1000) }) }),
      'stuck',
      bullJobState,
    );
  }
});

test('a stale bound must exceed the worker conversion timeout plus lock slack', () => {
  assert.doesNotThrow(() => assertStaleTimeoutAfterWorkerTimeout(1_800_000, 120_000));
  assert.throws(
    () => assertStaleTimeoutAfterWorkerTimeout(150_000, 120_000),
    /must exceed/u,
  );
  assert.doesNotThrow(() => assertStaleTimeoutAfterWorkerTimeout(300_000, 120_000, 30_000));
  assert.throws(() => assertStaleTimeoutAfterWorkerTimeout(300_000, 300_000, 30_000), /must exceed/u);
});

test('the recovery error is a stable, user-safe message', () => {
  assert.match(DOCUMENT_JOB_STALE_RECOVERY_ERROR, /Pokušajte ponovo/u);
  assert.equal(DOCUMENT_JOB_STALE_RECOVERY_ERROR.includes('/'), false);
  assert.equal(DOCUMENT_JOB_STALE_RECOVERY_ERROR.includes('<'), false);
});
