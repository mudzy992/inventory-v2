import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  businessTransitionMetricsRegistry,
  recordConditionalTransition,
  type BusinessTransitionMetricsSnapshot,
} from '../../common/metrics/business-transition-metrics.registry';
import { SettingsService } from '../settings/settings.service';
import { BusinessTransitionMetricsService } from './business-transition-metrics.service';
import {
  DEFAULT_BUSINESS_TRANSITION_METRICS_THRESHOLDS,
  BUSINESS_WARN_REJECTED_COUNT,
} from './utils/business-transition-metrics.util';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

const at = new Date('2026-10-27T12:00:00.000Z');
const SETTING_KEYS = [
  'business.metrics.warn_rejected_count',
  'business.metrics.warn_rejected_rate_percent',
  'business.metrics.warn_failed_terminal_count',
  'business.metrics.min_transition_count',
];

const createHarness = (
  options: {
    values?: Record<string, number>;
    settingsError?: Error;
    blocked?: Promise<void>;
  } = {},
): { service: BusinessTransitionMetricsService; logs: CapturedLog[]; readKeys: string[] } => {
  const readKeys: string[] = [];
  const settings = {
    getNumberValue: async (key: string, fallback: number): Promise<number> => {
      readKeys.push(key);
      if (options.blocked) await options.blocked;
      if (options.settingsError) throw options.settingsError;
      return options.values?.[key] ?? fallback;
    },
  } as unknown as SettingsService;
  const service = new BusinessTransitionMetricsService(settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };
  return { service, logs, readKeys };
};

const seed = (applied: number, rejected: number, terminalFailed = 0): void => {
  for (let index = 0; index < applied; index += 1) {
    recordConditionalTransition('document_job_terminal', 1, {
      fromStatus: 'queued|running',
      toStatus: index < terminalFailed ? 'failed' : 'done',
      terminal: index < terminalFailed ? 'failed' : 'done',
      at,
    });
  }
  for (let index = 0; index < rejected; index += 1) {
    recordConditionalTransition('transfer_open_status', 0, {
      fromStatus: 'raw|printed',
      toStatus: 'finalized',
      at,
    });
  }
};

const parseSummary = (logs: CapturedLog[]): Record<string, unknown> => {
  const summary = logs.find(({ line }) => line.includes('"event":"business_state_transition_metrics"'));
  assert.ok(summary, 'expected a business_state_transition_metrics log line');
  return JSON.parse(summary.line) as Record<string, unknown>;
};

describe('BusinessTransitionMetricsService', () => {
  it('emits a quiet structured summary with default thresholds', async () => {
    businessTransitionMetricsRegistry.reset(at);
    const { service, logs, readKeys } = createHarness();
    seed(3, 0);
    const snapshot = await service.reportMetrics(at);
    assert.ok(snapshot);
    assert.equal(snapshot.intervalTransitions, 3);
    assert.deepEqual([...readKeys].sort(), [...SETTING_KEYS].sort());
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'log');
    const line = parseSummary(logs);
    assert.equal(line.event, 'business_state_transition_metrics');
    assert.equal(line.level, 'log');
    assert.deepEqual(line.reasons, []);
    assert.equal(line.warnRejectedCount, BUSINESS_WARN_REJECTED_COUNT);
    assert.equal(line.minTransitionCount, 20);
    assert.equal(line.terminalDone, 3);
  });

  it('warns with ordered reasons for terminal failures and stale writes', async () => {
    businessTransitionMetricsRegistry.reset(at);
    const { service, logs } = createHarness({
      values: {
        'business.metrics.warn_rejected_count': 2,
        'business.metrics.warn_rejected_rate_percent': 10,
        'business.metrics.warn_failed_terminal_count': 2,
        'business.metrics.min_transition_count': 4,
      },
    });
    seed(4, 4, 2);
    const snapshot = await service.reportMetrics(at);
    assert.ok(snapshot);
    assert.equal(snapshot.terminalFailed, 2);
    assert.equal(snapshot.rejectedRatePercent, 50);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');
    const line = parseSummary(logs);
    assert.deepEqual(line.reasons, ['terminal_failures', 'rejected_burst', 'rejected_rate']);
    assert.equal(line.lastRejectedOperation, 'transfer_open_status');
    assert.ok(!logs[0].line.includes('session-'));
    assert.ok(!logs[0].line.includes('password'));
  });

  it('uses configured thresholds from the settings store', async () => {
    businessTransitionMetricsRegistry.reset(at);
    const { service, logs } = createHarness({
      values: {
        'business.metrics.warn_rejected_count': 2,
        'business.metrics.warn_rejected_rate_percent': 25,
        'business.metrics.warn_failed_terminal_count': 2,
        'business.metrics.min_transition_count': 2,
      },
    });
    seed(1, 2, 1);
    await service.reportMetrics(at);
    const line = parseSummary(logs);
    assert.equal(line.warnRejectedCount, 2);
    assert.equal(line.warnRejectedRatePercent, 25);
    assert.equal(line.warnFailedTerminalCount, 2);
    assert.equal(line.minTransitionCount, 2);
    assert.deepEqual(line.reasons, ['rejected_burst', 'rejected_rate']);
  });

  it('falls back to defaults for invalid setting values', async () => {
    businessTransitionMetricsRegistry.reset(at);
    const { service, logs } = createHarness({
      values: {
        'business.metrics.warn_rejected_count': 0,
        'business.metrics.warn_rejected_rate_percent': 101,
        'business.metrics.warn_failed_terminal_count': Number.NaN,
        'business.metrics.min_transition_count': -1,
      },
    });
    seed(1, 0);
    const snapshot = await service.reportMetrics(at);
    assert.ok(snapshot);
    const line = parseSummary(logs);
    const defaults = DEFAULT_BUSINESS_TRANSITION_METRICS_THRESHOLDS;
    assert.equal(line.warnRejectedCount, defaults.warnRejectedCount);
    assert.equal(line.warnRejectedRatePercent, defaults.warnRejectedRatePercent);
    assert.equal(line.warnFailedTerminalCount, defaults.warnFailedTerminalCount);
    assert.equal(line.minTransitionCount, defaults.minTransitionCount);
  });

  it('logs a redacted fallback for every failing setting', async () => {
    businessTransitionMetricsRegistry.reset(at);
    const { service, logs } = createHarness({
      settingsError: new Error('password=ci-secret settings unavailable'),
    });
    seed(1, 0);
    assert.ok(await service.reportMetrics(at));
    const fallbacks = logs.filter(({ line }) =>
      line.includes('business_transition_metrics_setting_fallback'),
    );
    assert.equal(fallbacks.length, 4);
    for (const fallback of fallbacks) {
      assert.ok(!fallback.line.includes('ci-secret'));
      assert.ok(fallback.line.includes('[redacted]'));
    }
    assert.deepEqual(parseSummary(logs).reasons, []);
  });

  it('does not run two reports at the same time', async () => {
    businessTransitionMetricsRegistry.reset(at);
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const { service, logs } = createHarness({ blocked });
    seed(1, 0);
    const first = service.reportMetrics(at);
    const overlapping = await service.reportMetrics(at);
    assert.equal(overlapping, null);
    release?.();
    await first;
    assert.equal(
      logs.filter(({ line }) => line.includes('business_state_transition_metrics')).length,
      1,
    );
  });

  it('reports a redacted error if the registry snapshot cannot be read', async (t) => {
    businessTransitionMetricsRegistry.reset(at);
    const { service, logs } = createHarness();
    const original = businessTransitionMetricsRegistry.consumeSnapshot;
    (businessTransitionMetricsRegistry as {
      consumeSnapshot: () => BusinessTransitionMetricsSnapshot;
    }).consumeSnapshot = () => {
      throw new Error('password=registry-secret');
    };
    t.after(() => {
      businessTransitionMetricsRegistry.consumeSnapshot = original;
      businessTransitionMetricsRegistry.reset(at);
    });
    assert.equal(await service.reportMetrics(at), null);
    const errorLog = logs.find(({ line }) =>
      line.includes('business_state_transition_metrics_error'),
    );
    assert.ok(errorLog);
    assert.equal(errorLog.level, 'error');
    assert.ok(!errorLog.line.includes('registry-secret'));
  });

  it('drains the interval but keeps lifetime totals and the rejection streak', async () => {
    businessTransitionMetricsRegistry.reset(at);
    const { service, logs } = createHarness();
    seed(1, 2);
    await service.reportMetrics(at);
    const second = await service.reportMetrics(at);
    assert.ok(second);
    assert.equal(second.intervalTransitions, 0);
    assert.equal(second.totalTransitions, 3);
    assert.equal(second.consecutiveRejections, 2);
    assert.equal(logs.length, 2);
    assert.deepEqual(JSON.parse(logs[1].line).reasons, []);

    seed(1, 0);
    await service.reportMetrics(at);
    assert.equal(logs[2].level, 'log');
    assert.equal(JSON.parse(logs[2].line).consecutiveRejections, 0);
  });
});
