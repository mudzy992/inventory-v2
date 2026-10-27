import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import {
  businessTransitionMetricsRegistry,
  type BusinessTransitionMetricsSnapshot,
} from '../src/common/metrics/business-transition-metrics.registry';
import { DocumentJobsService } from '../src/modules/documents/document-jobs.service';
import { BusinessTransitionMetricsService } from '../src/modules/health/business-transition-metrics.service';
import { evaluateBusinessTransitionMetrics } from '../src/modules/health/utils/business-transition-metrics.util';
import { claimDisposalApprovalReviewInTx } from '../src/modules/inventory-count/utils/claim-disposal-approval-review.util';
import { SETTINGS_REGISTRY } from '../src/modules/settings/settings.registry';
import type { SettingsService } from '../src/modules/settings/settings.service';
import { claimTransferForFinalizeInTx } from '../src/modules/transfers/utils/claim-transfer-finalize.util';
import { consumeStockLotReceiptFifoInTx } from '../src/modules/warehouse-stock/utils/consume-stock-lot-receipt-fifo.util';
import type { PrismaService } from '../src/prisma/prisma.service';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

const at = new Date('2026-10-27T12:00:00.000Z');

const counterStore = (counts: number[]) => {
  let index = 0;
  return { updateMany: async () => ({ count: counts[Math.min(index++, counts.length - 1)] ?? 0 }) };
};

const createService = (
  values: Record<string, number> = {},
): { service: BusinessTransitionMetricsService; logs: CapturedLog[] } => {
  const settings = {
    getNumberValue: async (key: string, fallback: number): Promise<number> =>
      values[key] ?? fallback,
  } as unknown as SettingsService;
  const service = new BusinessTransitionMetricsService(settings);
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line: string) => logs.push({ level: 'log', line }),
    warn: (line: string) => logs.push({ level: 'warn', line }),
    error: (line: string) => logs.push({ level: 'error', line }),
  };
  return { service, logs };
};

const collectSourceFiles = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) files.push(full);
  }
  return files;
};

const main = async (): Promise<void> => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Business transition metrics wiring check is restricted to NODE_ENV=test');
  }
  businessTransitionMetricsRegistry.reset(at);

  // Real conditional-transition utils: two applied transfer claims, one stale.
  const transferStore = { transfer: counterStore([1, 1, 0]) } as never;
  await claimTransferForFinalizeInTx(transferStore, 'transfer-1', { status: 'potpisan' } as never);
  await claimTransferForFinalizeInTx(transferStore, 'transfer-2', { status: 'potpisan' } as never);
  await assert.rejects(
    claimTransferForFinalizeInTx(transferStore, 'transfer-3', { status: 'potpisan' } as never),
    BadRequestException,
  );

  // Disposal approval: one applied review, one duplicate.
  const approvalStore = { disposalInventoryApproval: counterStore([1, 0]) } as never;
  await claimDisposalApprovalReviewInTx(approvalStore, 'approval-1', { status: 'approved' } as never);
  await assert.rejects(
    claimDisposalApprovalReviewInTx(approvalStore, 'approval-2', { status: 'approved' } as never),
    BadRequestException,
  );

  // FIFO contention: exhausted batch (rejected) then a successful decrement.
  const fifoResult = await consumeStockLotReceiptFifoInTx(
    {
      warehouseStockLotReceipt: {
        ...counterStore([0, 1]),
        findFirst: async () => ({ id: 'receipt-1', entryDate: at, contractNumber: null }),
      },
    } as never,
    'lot-1',
  );
  assert.equal(fifoResult.contractNumber, null);

  // DocumentJob terminal transitions through the real service: two applied
  // failures and one stale (ignored) attempt.
  const terminalCounter = counterStore([1, 1, 0]);
  const prisma = {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      run({ documentJob: { ...terminalCounter, findUnique: async () => null } }),
  } as unknown as PrismaService;
  const documentJobs = new DocumentJobsService(prisma);
  await documentJobs.markFailed('job-1', 'conversion failed', 1, false);
  await documentJobs.markFailed('job-2', 'conversion failed', 1, false);
  await documentJobs.markFailed('job-3', 'conversion failed', 1, false);

  const thresholds = {
    warnRejectedCount: 2,
    warnRejectedRatePercent: 10,
    warnFailedTerminalCount: 2,
    minTransitionCount: 4,
  };
  const { service, logs } = createService({
    'business.metrics.warn_rejected_count': thresholds.warnRejectedCount,
    'business.metrics.warn_rejected_rate_percent': thresholds.warnRejectedRatePercent,
    'business.metrics.warn_failed_terminal_count': thresholds.warnFailedTerminalCount,
    'business.metrics.min_transition_count': thresholds.minTransitionCount,
  });
  const snapshot: BusinessTransitionMetricsSnapshot | null = await service.reportMetrics(at);
  assert.ok(snapshot);
  assert.equal(snapshot.intervalTransitions, 10);
  assert.equal(snapshot.applied, 6);
  assert.equal(snapshot.rejected, 4);
  assert.equal(snapshot.rejectedRatePercent, 40);
  assert.equal(snapshot.terminalFailed, 2);
  assert.equal(snapshot.byOperation.transfer_open_status, 3);
  assert.equal(snapshot.byOperation.document_job_terminal, 3);
  assert.equal(snapshot.byOperation.notification_outbox_claim, undefined);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'warn');

  const line = JSON.parse(logs[0].line) as Record<string, unknown>;
  assert.equal(line.event, 'business_state_transition_metrics');
  assert.equal(line.level, 'warn');
  assert.deepEqual(line.reasons, ['terminal_failures', 'rejected_burst', 'rejected_rate']);
  assert.deepEqual(evaluateBusinessTransitionMetrics(snapshot, thresholds).reasons, line.reasons);
  for (const identifier of ['transfer-1', 'approval-1', 'lot-1', 'job-1', 'conversion failed']) {
    assert.ok(!logs[0].line.includes(identifier), `leaked ${identifier}`);
  }

  // A single successful write clears the rejection streak; the next report
  // with default thresholds is quiet again.
  await claimTransferForFinalizeInTx(
    { transfer: counterStore([1]) } as never,
    'transfer-4',
    { status: 'potpisan' } as never,
  );
  const quiet = createService();
  const quietSnapshot = await quiet.service.reportMetrics(at);
  assert.ok(quietSnapshot);
  assert.equal(quietSnapshot.intervalTransitions, 1);
  assert.equal(quietSnapshot.consecutiveRejections, 0);
  assert.equal(quietSnapshot.totalTransitions, 11);
  assert.equal(quiet.logs.length, 1);
  assert.equal(quiet.logs[0].level, 'log');
  assert.deepEqual(JSON.parse(quiet.logs[0].line).reasons, []);

  // Configuration wiring: every conditional write site is instrumented, the
  // health module schedules the reporter, and thresholds are validated.
  const srcRoot = resolve('src');
  let hookCount = 0;
  for (const file of collectSourceFiles(srcRoot)) {
    const source = readFileSync(file, 'utf8');
    hookCount += (source.match(/recordConditionalTransition\(/gu) ?? []).length;
  }
  assert.ok(hookCount >= 9, `expected instrumented conditional writes, found ${hookCount}`);
  const healthModuleSource = readFileSync(
    resolve('src/modules/health/health.module.ts'),
    'utf8',
  );
  assert.ok(healthModuleSource.includes('BusinessTransitionMetricsService'));
  const expectedSettings: Record<string, number> = {
    'business.metrics.warn_rejected_count': 20,
    'business.metrics.warn_rejected_rate_percent': 10,
    'business.metrics.warn_failed_terminal_count': 10,
    'business.metrics.min_transition_count': 20,
  };
  for (const [key, defaultValue] of Object.entries(expectedSettings)) {
    const definition = SETTINGS_REGISTRY.find((entry) => entry.key === key);
    assert.ok(definition, `missing setting definition: ${key}`);
    assert.equal(definition.defaultValue, defaultValue);
    assert.equal(definition.valueType, 'number');
    assert.equal(definition.scope, 'private');
    assert.ok(definition.minValue !== undefined && definition.maxValue !== undefined);
  }

  businessTransitionMetricsRegistry.reset(at);
  console.log(
    `Verified business transition metrics: transitions=${snapshot.intervalTransitions}, ` +
      `rejected=${snapshot.rejected}, terminalFailed=${snapshot.terminalFailed}, ` +
      `hooks=${hookCount}, level=${logs[0].level}.`,
  );
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
