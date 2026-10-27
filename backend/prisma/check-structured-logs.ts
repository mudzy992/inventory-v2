import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Queue } from 'bullmq';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventorySessionCloseReconcilerService } from '../src/modules/inventory-count/inventory-session-close-reconciler.service';

interface CapturedLog {
  level: 'log' | 'warn' | 'error';
  line: string;
}

const SRC_ROOT = resolve('src');

const collectSourceFiles = (directory: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
};

const captureLogger = (service: object): CapturedLog[] => {
  const logs: CapturedLog[] = [];
  (service as unknown as { logger: Record<string, (line: string) => void> }).logger = {
    log: (line) => logs.push({ level: 'log', line }),
    warn: (line) => logs.push({ level: 'warn', line }),
    error: (line) => logs.push({ level: 'error', line }),
  };
  return logs;
};

const main = async (): Promise<void> => {
  const files = collectSourceFiles(SRC_ROOT);
  assert.ok(files.length > 50, 'source scan must cover the backend tree');

  // 1. No free-form template/string logger calls remain in production code.
  const freeForm = /\blogger\.(?:log|warn|error|debug|verbose|fatal)\(\s*(?:`|'|")/u;
  const rawInterpolation = /\$\{String\(/u;
  const violations: string[] = [];
  let structuredCalls = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const name = relative(SRC_ROOT, file);
    if (freeForm.test(source)) {
      violations.push(`${name}: free-form logger call with a literal message`);
    }
    if (rawInterpolation.test(source)) {
      violations.push(`${name}: raw String() template interpolation`);
    }
    for (const match of source.matchAll(/logStructuredEvent\(/gu)) {
      structuredCalls += 1;
      const window = source.slice(match.index ?? 0, (match.index ?? 0) + 400);
      if (!window.includes('event:')) {
        violations.push(`${name}: logStructuredEvent call without an event name`);
      }
    }
  }
  assert.deepEqual(violations, [], 'all operational log lines must be structured JSON');
  assert.ok(structuredCalls >= 45, `expected the migrated structured call sites, found ${structuredCalls}`);

  // 2. A real scheduler/reconciler failure emits one parseable, redacted JSON line.
  const brokenPrisma = {
    inventorySessionCloseJob: {
      findMany: async (): Promise<never> => {
        throw new Error('password=ci-secret DB unavailable at /app/tmp/db');
      },
    },
  } as unknown as PrismaService;
  const queue = { add: async () => undefined } as unknown as Queue;
  const reconciler = new InventorySessionCloseReconcilerService(brokenPrisma, queue);
  const logs = captureLogger(reconciler);
  await reconciler.reconcileQueuedJobs();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'error');
  const failure = JSON.parse(logs[0].line) as Record<string, unknown>;
  assert.equal(failure.event, 'inventory_close_reconcile_failed');
  assert.equal(failure.level, 'error');
  assert.ok(!logs[0].line.includes('ci-secret'));
  assert.ok(!logs[0].line.includes('/app/tmp/db'));

  // 3. Per-job enqueue failures keep only internal IDs, never Redis secrets.
  const jobUpdatedAt = new Date('2026-10-27T11:00:00.000Z');
  const enqueueFailingPrisma = {
    inventorySessionCloseJob: {
      findMany: async () => [
        { id: 'close-job-1', sessionId: 'session-1', updatedAt: jobUpdatedAt },
      ],
    },
  } as unknown as PrismaService;
  const failingQueue = {
    add: async (): Promise<never> => {
      throw new Error('token=ci-redis-secret ECONNREFUSED');
    },
  } as unknown as Queue;
  const enqueueReconciler = new InventorySessionCloseReconcilerService(
    enqueueFailingPrisma,
    failingQueue,
  );
  const enqueueLogs = captureLogger(enqueueReconciler);
  await enqueueReconciler.reconcileQueuedJobs();
  assert.equal(enqueueLogs.length, 1);
  const enqueueFailure = JSON.parse(enqueueLogs[0].line) as Record<string, unknown>;
  assert.equal(enqueueFailure.event, 'inventory_close_reconcile_enqueue_failed');
  assert.equal(enqueueFailure.sessionId, 'session-1');
  assert.ok(!enqueueLogs[0].line.includes('ci-redis-secret'));

  console.log(
    `Verified structured logs: ${files.length} source files, ${structuredCalls} structured call sites, ` +
      'zero free-form literals, redacted reconcile/enqueue failures.',
  );
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
