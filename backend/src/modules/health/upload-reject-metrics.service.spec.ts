import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  setUploadRejectLogEnabled,
  uploadRejectRegistry,
} from '../../common/upload/upload-reject.registry';
import { SettingsService } from '../settings/settings.service';
import { UploadRejectMetricsService } from './upload-reject-metrics.service';
import { UPLOAD_WARN_REJECT_COUNT } from './utils/upload-reject-metrics.util';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

const at = new Date('2026-10-26T23:00:00.000Z');

const createHarness = (
  options: { threshold?: number; settingsError?: Error } = {},
): { service: UploadRejectMetricsService; logs: CapturedLog[] } => {
  const settings = {
    getNumberValue: async (_key: string, fallback: number): Promise<number> => {
      if (options.settingsError) throw options.settingsError;
      return options.threshold ?? fallback;
    },
  } as unknown as SettingsService;
  const service = new UploadRejectMetricsService(settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };
  return { service, logs };
};

const recordRejects = (count: number, reason = 'multipart_reject'): void => {
  for (let index = 0; index < count; index += 1) {
    uploadRejectRegistry.record(
      {
        operation: 'multipart',
        reason: reason as 'multipart_reject',
        at,
      },
      { emitLog: false },
    );
  }
};

describe('UploadRejectMetricsService', () => {
  it('emits a structured quiet summary with the configured threshold', async (t) => {
    uploadRejectRegistry.reset(at);
    setUploadRejectLogEnabled(false);
    t.after(() => setUploadRejectLogEnabled(true));
    const { service, logs } = createHarness({ threshold: 7 });
    recordRejects(2);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(snapshot.intervalRejects, 2);
    assert.equal(snapshot.totalRejects, 2);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'log');
    const line = JSON.parse(logs[0].line) as Record<string, unknown>;
    assert.equal(line.event, 'upload_reject_metrics');
    assert.equal(line.warnRejectCount, 7);
    assert.equal(line.level, 'log');
    assert.deepEqual(line.reasons, []);
    assert.deepEqual(line.intervalByReason, { multipart_reject: 2 });
  });

  it('warns when the interval threshold is reached', async (t) => {
    uploadRejectRegistry.reset(at);
    setUploadRejectLogEnabled(false);
    t.after(() => setUploadRejectLogEnabled(true));
    const { service, logs } = createHarness({ threshold: 3 });
    recordRejects(3);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');
    const line = JSON.parse(logs[0].line) as { reasons: string[] };
    assert.deepEqual(line.reasons, ['interval_rejects']);
  });

  it('falls back to the default threshold when settings fail, without leaking the error', async (t) => {
    uploadRejectRegistry.reset(at);
    setUploadRejectLogEnabled(false);
    t.after(() => setUploadRejectLogEnabled(true));
    const { service, logs } = createHarness({
      settingsError: new Error('password=ci-secret settings unavailable'),
    });
    recordRejects(1);
    const snapshot = await service.reportMetrics();
    assert.ok(snapshot);
    assert.equal(logs.length, 2);
    const fallback = JSON.parse(logs[0].line) as Record<string, unknown>;
    assert.equal(logs[0].level, 'warn');
    assert.equal(fallback.event, 'upload_metrics_setting_fallback');
    assert.equal(logs[0].line.includes('ci-secret'), false);
    const summary = JSON.parse(logs[1].line) as Record<string, unknown>;
    assert.equal(summary.warnRejectCount, UPLOAD_WARN_REJECT_COUNT);
    assert.equal(summary.event, 'upload_reject_metrics');
  });

  it('does not keep the interval counters after a report', async (t) => {
    uploadRejectRegistry.reset(at);
    setUploadRejectLogEnabled(false);
    t.after(() => setUploadRejectLogEnabled(true));
    const { service, logs } = createHarness({ threshold: 10 });
    recordRejects(4);
    await service.reportMetrics();
    await service.reportMetrics();
    assert.equal(logs.length, 2);
    const second = JSON.parse(logs[1].line) as Record<string, unknown>;
    assert.equal(second.intervalRejects, 0);
    assert.equal(second.totalRejects, 4);
  });
});
