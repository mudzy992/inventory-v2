#!/usr/bin/env node
/**
 * Recovery contract matrix for every critical async flow.
 *
 * The audit's exit criterion: "no job stays permanently queued/running/closing
 * without an owner, and retry must not duplicate a business effect". This gate
 * keeps that criterion executable: for each crash point it asserts that a
 * named recoverer exists in production code, that an idempotency key exists,
 * that a dedicated fault-injection check exists AND is wired into CI.
 *
 * Dependency free; runs in CI before any install. Use --json for a report.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const RECOVERY_MATRIX = [
  {
    id: 'inventory-close-enqueue',
    flow: 'Inventory session close',
    crashPoint: 'Redis unavailable at the initial close enqueue',
    stuckState: 'queued',
    recoverer: 'InventorySessionCloseReconcilerService.reconcileQueuedJobs',
    source: 'backend/src/modules/inventory-count/inventory-session-close-reconciler.service.ts',
    symbols: ['reconcileQueuedJobs', 'buildInventoryCloseRecoveryJobId'],
    idempotency: 'buildInventoryCloseRecoveryJobId(job.id, job.updatedAt)',
    check: 'backend/prisma/check-inventory-close-reconciler-concurrency.ts',
    ciStep: 'Verify concurrent inventory close reconcilers',
  },
  {
    id: 'inventory-close-lease',
    flow: 'Inventory session close',
    crashPoint: 'SIGKILL after a pending-action side effect commits',
    stuckState: 'running (expired lease)',
    recoverer: 'buildInventoryCloseJobClaimWhere + lease heartbeat',
    source: 'backend/src/modules/inventory-count/utils/inventory-close-lease.util.ts',
    symbols: ['buildInventoryCloseJobClaimWhere', 'getInventoryCloseLeaseUntil'],
    idempotency: 'leaseToken UUID + conditional updateMany',
    check: 'backend/prisma/check-inventory-close-lease-recovery.ts',
    ciStep: 'Verify expired inventory close lease recovery',
  },
  {
    id: 'inventory-close-manual-retry',
    flow: 'Inventory session close',
    crashPoint: 'final BullMQ attempt failed, admin retries',
    stuckState: 'failed',
    recoverer: 'manual retry claim (admin only, audited)',
    source: 'backend/src/modules/inventory-count/inventory-count.service.ts',
    symbols: ['retryFailedCloseSession', "status: 'failed'"],
    idempotency: 'conditional status claim',
    check: 'backend/prisma/check-inventory-manual-close-retry-race.ts',
    ciStep: 'Verify concurrent admin retries for failed inventory close',
  },
  {
    id: 'document-job-enqueue',
    flow: 'Document conversion',
    crashPoint: 'crash between DocumentJob.create() and queue.add()',
    stuckState: 'queued (no Bull job)',
    recoverer: 'DocumentConversionEventsService.reconcileStaleJobs (missing-job grace)',
    source: 'backend/src/modules/documents/document-conversion-events.service.ts',
    symbols: ['MISSING_BULL_JOB_GRACE_MS', 'reconcileStaleJobs'],
    idempotency: 'documentJobTerminalOutboxKey(jobId, failed)',
    check: 'backend/prisma/check-document-job-enqueue-crash-recovery.ts',
    ciStep: 'Verify DocumentJob enqueue crash recovery',
  },
  {
    id: 'document-job-stuck',
    flow: 'Document conversion',
    crashPoint: 'worker SIGKILL; BullMQ job stays waiting/active forever',
    stuckState: 'running / queued (bounded)',
    recoverer: 'decideStaleRecovery + DOCUMENT_JOB_STALE_TIMEOUT_MS',
    source: 'backend/src/modules/documents/document-job-recovery-policy.util.ts',
    symbols: ['decideStaleRecovery', 'resolveDocumentJobStaleMs', 'DOCUMENT_JOB_STALE_RECOVERY_ERROR'],
    idempotency: 'monotonic terminal status + terminal outbox key',
    check: 'backend/prisma/check-document-job-stale-recovery.ts',
    ciStep: 'Verify stale DocumentJob recovery',
  },
  {
    id: 'document-job-terminal-outbox',
    flow: 'Document conversion',
    crashPoint: 'terminal QueueEvents lost after commit',
    stuckState: 'terminal notification missing',
    recoverer: 'durable terminal notification outbox',
    source: 'backend/src/modules/documents/document-job-terminal-outbox.util.ts',
    symbols: ['documentJobTerminalOutboxKey', 'buildDocumentJobTerminalOutboxRow'],
    idempotency: 'NotificationOutbox.idempotencyKey unique',
    check: 'backend/prisma/check-document-job-terminal-outbox.ts',
    ciStep: 'Verify durable DocumentJob terminal notifications',
  },
  {
    id: 'document-event-race',
    flow: 'Document conversion',
    crashPoint: 'QueueEvents subscription races a completed/failed event',
    stuckState: 'queued/running after terminal Bull job',
    recoverer: 'startup + periodic reconcileStaleJobs',
    source: 'backend/src/modules/documents/document-conversion-events.service.ts',
    symbols: ['onModuleInit', 'reconcileStaleJobs'],
    idempotency: 'conditional markDone/markFailed',
    check: 'backend/prisma/check-document-event-reconcile-race.ts',
    ciStep: 'Verify document event reconciliation race recovery',
  },
  {
    id: 'transfer-docx',
    flow: 'Transfer document generation',
    crashPoint: 'crash after DOCX file write before status update',
    stuckState: 'generation state stale',
    recoverer: 'durable generation state + separate retry',
    source: 'backend/src/modules/transfers/transfer-document-generation.service.ts',
    symbols: ['generatedDocxLeaseToken', 'generatedDocxLeaseUntil'],
    idempotency: 'lease token + conditional claim',
    check: 'backend/prisma/check-transfer-docx-crash-recovery.ts',
    ciStep: 'Verify transfer DOCX crash recovery',
  },
  {
    id: 'notification-outbox',
    flow: 'Notifications',
    crashPoint: 'crash after business commit before notification emit',
    stuckState: 'pending outbox',
    recoverer: 'NotificationOutboxRelayService',
    source: 'backend/src/modules/notifications/notification-outbox-relay.service.ts',
    symbols: ['NotificationOutboxRelayService', 'leaseUntil'],
    idempotency: 'outbox idempotencyKey unique',
    check: 'backend/prisma/check-notification-outbox-crash-replay.ts',
    ciStep: 'Verify notification outbox crash replay',
  },
];

export const checkRecoveryContract = (root = ROOT, overrides = {}) => {
  const errors = [];
  const overriddenSources = overrides.sources ?? {};
  const read = (relative) =>
    Object.prototype.hasOwnProperty.call(overriddenSources, relative)
      ? overriddenSources[relative]
      : readFileSync(join(root, relative), 'utf8');
  const pkgSource = overrides.packageJson ?? read('backend/package.json');
  const ciSource = overrides.ci ?? read('.github/workflows/ci.yml');
  const packageJson = JSON.parse(pkgSource);

  for (const row of RECOVERY_MATRIX) {
    const checkPath = join(root, row.check);
    if (!existsSync(checkPath)) {
      errors.push(`${row.id}: fault-injection check ${row.check} is missing`);
    }
    const script = Object.entries(packageJson.scripts ?? {}).find(([, value]) =>
      String(value).includes(row.check.replace('backend/prisma/', 'prisma/')),
    );
    if (!script) {
      errors.push(`${row.id}: no npm script runs ${row.check}`);
    } else if (!ciSource.includes(`npm run ${script[0]}`)) {
      errors.push(`${row.id}: CI does not run ${script[0]}`);
    }
    if (!ciSource.includes(row.ciStep)) {
      errors.push(`${row.id}: CI step "${row.ciStep}" is missing`);
    }
    const sourcePath = join(root, row.source);
    if (!existsSync(sourcePath)) {
      errors.push(`${row.id}: recoverer source ${row.source} is missing`);
      continue;
    }
    const source = read(row.source);
    for (const symbol of row.symbols) {
      if (!source.includes(symbol)) {
        errors.push(`${row.id}: recoverer symbol ${symbol} is missing from ${row.source}`);
      }
    }
    if (!row.idempotency) errors.push(`${row.id}: no idempotency key declared`);
  }

  // The bounded recovery must be configurable and must not fire before the
  // document-worker's own conversion timeout.
  for (const file of ['.env.example', 'docker-compose.yml', 'docker-compose.prod.yml']) {
    if (!read(file).includes('DOCUMENT_JOB_STALE_TIMEOUT_MS')) {
      errors.push(`stale-bound: ${file} must expose DOCUMENT_JOB_STALE_TIMEOUT_MS`);
    }
  }
  const events = read('backend/src/modules/documents/document-conversion-events.service.ts');
  for (const symbol of ['decideStaleRecovery', 'DOCUMENT_JOB_STALE_TIMEOUT_MS', "decision === 'stuck'"]) {
    if (!events.includes(symbol)) errors.push(`stale-bound: reconcileStaleJobs must use ${symbol}`);
  }
  const readiness = read('scripts/check-deployment-readiness.mjs');
  if (!readiness.includes('document-job-stale-bound')) {
    errors.push('stale-bound: deployment readiness must validate the stale/worker timeout relation');
  }
  return { checked: RECOVERY_MATRIX.length, errors };
};

const main = () => {
  const { checked, errors } = checkRecoveryContract();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ checked, errors, ok: errors.length === 0 }, null, 2));
  } else if (errors.length > 0) {
    for (const error of errors) console.error(`  - ${error}`);
    console.error(`Recovery contract FAILED (${checked} crash points, ${errors.length} problems).`);
  } else {
    console.log(
      `Recovery contract passed (${checked} crash points, each with a recoverer, idempotency key, fault-injection check and CI step; bounded DocumentJob stale recovery configured).`,
    );
  }
  return errors.length > 0 ? 1 : 0;
};

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
