import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { UploadRejectSnapshot } from '../../../common/upload/upload-reject.registry';
import {
  evaluateUploadRejectMetrics,
  UPLOAD_REJECT_METRICS_INTERVAL_MS,
  UPLOAD_WARN_REJECT_COUNT,
} from './upload-reject-metrics.util';

const snapshot = (intervalRejects: number): UploadRejectSnapshot => ({
  observedAt: '2026-10-26T23:00:30.000Z',
  startedAt: '2026-10-26T23:00:00.000Z',
  intervalStartedAt: '2026-10-26T23:00:00.000Z',
  intervalEndedAt: '2026-10-26T23:00:30.000Z',
  totalRejects: intervalRejects + 5,
  intervalRejects,
  byOperation: { multipart: intervalRejects },
  byReason: { multipart_reject: intervalRejects },
  intervalByOperation: { multipart: intervalRejects },
  intervalByReason: { multipart_reject: intervalRejects },
  lastRejectAt: '2026-10-26T23:00:10.000Z',
  lastReason: 'multipart_reject',
});

describe('upload-reject metrics constants', () => {
  it('uses the shared 30-second reporting interval and a positive default threshold', () => {
    assert.equal(UPLOAD_REJECT_METRICS_INTERVAL_MS, 30_000);
    assert.equal(UPLOAD_WARN_REJECT_COUNT, 10);
  });
});

describe('evaluateUploadRejectMetrics', () => {
  it('keeps a quiet interval at log level', () => {
    assert.deepEqual(evaluateUploadRejectMetrics(snapshot(3), 10), {
      level: 'log',
      reasons: [],
    });
  });

  it('warns when the configured interval threshold is reached', () => {
    assert.deepEqual(evaluateUploadRejectMetrics(snapshot(10), 10), {
      level: 'warn',
      reasons: ['interval_rejects'],
    });
    assert.deepEqual(evaluateUploadRejectMetrics(snapshot(25), 10), {
      level: 'warn',
      reasons: ['interval_rejects'],
    });
  });

  it('honors an admin-provided threshold', () => {
    assert.deepEqual(evaluateUploadRejectMetrics(snapshot(4), 4), {
      level: 'warn',
      reasons: ['interval_rejects'],
    });
    assert.deepEqual(evaluateUploadRejectMetrics(snapshot(4), 5), {
      level: 'log',
      reasons: [],
    });
  });
});
