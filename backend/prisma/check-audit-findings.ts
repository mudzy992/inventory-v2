import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Release gate for the five findings taken from the independent code audit
 * (docs/backend-code-audit-2026-10-27.md): N-5, N-6, N-7, N-8, N-12.
 * Static source invariants + a characterization-spec coverage check keep
 * these fixes from silently regressing.
 */

const ROOT = resolve('.');
const SRC = resolve(ROOT, 'src');
const read = (relative: string): string => readFileSync(resolve(SRC, relative), 'utf8');

const CHARACTERIZED_SERVICES = [
  'modules/equipment/equipment.service',
  'modules/transfers/transfers.service',
  'modules/warehouse-stock/warehouse-stock.service',
  'modules/notifications/notifications.service',
  'modules/employee-relocation/employee-relocation.service',
  'modules/employees/employees.service',
  'modules/users/users.service',
] as const;

const main = (): void => {
  // --- N-5: bounded org/warehouse resolution -----------------------------
  const warehouseResolution = read('common/services/warehouse-resolution.service.ts');
  const inventoryCount = read('modules/inventory-count/inventory-count.service.ts');
  for (const expected of [
    'getWarehouseGraph(',
    'isScopeCacheStale(',
    'findEmployeeIdsForWarehouse(',
    'take: 10_000',
  ]) {
    assert.ok(warehouseResolution.includes(expected), `N-5: warehouse resolution must use ${expected}`);
  }
  assert.ok(
    inventoryCount.includes('findEmployeeIdsForWarehouse('),
    'N-5: inventory count must use the single-query resolver',
  );
  assert.equal(
    /for \(const employee of employees\)/u.test(inventoryCount),
    false,
    'N-5: the per-employee resolveForEmployee loop must stay removed',
  );

  // --- N-6: batched notification fan-out ---------------------------------
  const notifications = read('modules/notifications/notifications.service.ts');
  const createForUsers = notifications.slice(
    notifications.indexOf('private async createForUsers('),
    notifications.indexOf('private async areNotificationsEnabled('),
  );
  assert.match(createForUsers, /createManyAndReturn\(/u, 'N-6: one INSERT per fan-out');
  assert.doesNotMatch(createForUsers, /notification\.create\(/u);
  assert.equal((createForUsers.match(/for \(const row of rows\)/gu) ?? []).length, 1);

  // --- N-8: durable stock-receipt notifications --------------------------
  const stock = read('modules/warehouse-stock/warehouse-stock.service.ts');
  assert.match(stock, /buildWarehouseStockReceivedOutboxRows\(tx/u, 'N-8: outbox inside tx');
  assert.equal(
    (stock.match(/notificationOutbox\.createMany\(/gu) ?? []).length,
    2,
    'N-8: both single and bulk receive paths must write outbox rows',
  );
  assert.doesNotMatch(stock, /notifyWarehouseStockReceived\(/u);
  assert.match(notifications, /warehouse-stock-received:/u);

  // --- N-7: durable org-unit change --------------------------------------
  const relocation = read('modules/employee-relocation/employee-relocation.service.ts');
  const employees = read('modules/employees/employees.service.ts');
  const handle = relocation.slice(
    relocation.indexOf('async handleOrgUnitChange('),
    relocation.indexOf('async listForUser('),
  );
  assert.match(handle, /tx: Prisma\.TransactionClient/u);
  assert.match(handle, /notificationOutbox\.createMany\(/u);
  assert.match(handle, /employee-relocation-action:/u);
  assert.doesNotMatch(handle, /notifyEmployeeRelocation/u);
  assert.match(employees, /relocationNeeded/u);
  const txStart = employees.indexOf('$transaction(async (tx)');
  assert.ok(txStart > 0);
  assert.match(employees.slice(txStart, txStart + 1600), /handleOrgUnitChange\(/u);

  // --- N-12: characterization specs for the largest services -------------
  for (const service of CHARACTERIZED_SERVICES) {
    const spec = resolve(SRC, `${service}.characterization.spec.ts`);
    assert.ok(existsSync(spec), `N-12: ${service} needs a characterization spec`);
    const specSource = readFileSync(spec, 'utf8');
    assert.match(specSource, /import \{ .*Service \} from '\.\/.*\.service'/u);
    assert.ok(specSource.includes("test("), `${service} characterization spec must contain tests`);
  }
  assert.equal(existsSync(resolve(SRC, 'modules/transfers/utils/docx-to-pdf.util.ts')), false);

  console.log(
    `Independent audit findings gate passed (N-5 bounded graph + 1 employee query, N-6 batched fan-out, N-7 in-transaction relocation + outbox, N-8 2 durable stock paths, N-12 7 characterized services).`,
  );
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
