import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Release gate for the findings from the independent code audit
 * (docs/backend-code-audit-2026-10-27.md): N-5..N-15.
 * Static source invariants + a characterization-spec coverage check keep
 * these fixes from silently regressing.
 */

const ROOT = resolve('.');
const SRC = resolve(ROOT, 'src');
const read = (relative: string): string => readFileSync(resolve(SRC, relative), 'utf8');
const repoRead = (relative: string): string => readFileSync(resolve(ROOT, '..', relative), 'utf8');

const CHARACTERIZED_SERVICES = [
  'modules/equipment/equipment.service',
  'modules/transfers/transfers.service',
  'modules/warehouse-stock/warehouse-stock.service',
  'modules/notifications/notifications.service',
  'modules/employee-relocation/employee-relocation.service',
  'modules/employees/employees.service',
  'modules/users/users.service',
] as const;

const walkTs = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkTs(path, acc);
    else if (entry.name.endsWith('.ts')) acc.push(path);
  }
  return acc;
};

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
    assert.ok(specSource.includes('test('), `${service} characterization spec must contain tests`);
  }
  assert.equal(existsSync(resolve(SRC, 'modules/transfers/utils/docx-to-pdf.util.ts')), false);

  // --- N-9: typed query DTOs + globally validated UUID path params -------
  const appModule = read('app.module.ts');
  const uuidPipe = read('common/pipes/uuid-param.pipe.ts');
  assert.match(appModule, /APP_PIPE/u, 'N-9: UuidParamPipe must be registered globally');
  assert.match(appModule, /UuidParamPipe/u);
  assert.match(uuidPipe, /isUUID\(/u, 'N-9: pipe must validate real UUIDs');
  assert.match(uuidPipe, /metadata\.type !== 'param'/u);
  const inventoryController = read('modules/inventory-count/inventory-count.controller.ts');
  const warehousesController = read('modules/warehouses/warehouses.controller.ts');
  const transfersController = read('modules/transfers/transfers.controller.ts');
  for (const [label, source, dto] of [
    ['inventory-count', inventoryController, 'EnsureDraftQueryDto'],
    ['warehouses', warehousesController, 'ResolveEffectiveWarehouseQueryDto'],
    ['transfers', transfersController, 'GeneratedDocumentFormatQueryDto'],
  ] as const) {
    assert.match(source, new RegExp(dto, 'u'), `N-9: ${label} must use a typed query DTO`);
    assert.doesNotMatch(
      source,
      /@Query\('[^']+'\) [A-Za-z]+\??: string/u,
      `N-9: ${label} still has a raw string @Query parameter`,
    );
  }
  assert.doesNotMatch(inventoryController, /Number\(year\)/u, 'N-9: unvalidated Number(year)');
  const ensureDraftDto = read('modules/inventory-count/dto/ensure-draft-query.dto.ts');
  assert.match(ensureDraftDto, /@Min\(2000\)/u);
  assert.match(ensureDraftDto, /@Max\(2100\)/u);
  assert.match(ensureDraftDto, /@IsUUID\(/u);
  assert.match(
    read('modules/inventory-count/dto/committee-setup-options-query.dto.ts'),
    /@IsUUID\(/u,
  );

  // --- N-10: fail-closed JWT TTL ------------------------------------------
  const authService = read('modules/auth/auth.service.ts');
  const authConfig = read('modules/auth/auth-config.util.ts');
  const mainTs = read('main.ts');
  assert.match(authService, /assertJwtTtl\(ttl, 'JWT_REFRESH_TTL'\)/u, 'N-10: no silent fallback');
  assert.doesNotMatch(authService, /7 \* 24 \* 60 \* 60 \* 1000/u);
  assert.match(authConfig, /JWT_TTL_PATTERN/u);
  assert.match(mainTs, /assertJwtTtl\(configService\.get<string>\('JWT_ACCESS_TTL'\)/u);
  assert.match(mainTs, /assertJwtTtl\(configService\.get<string>\('JWT_REFRESH_TTL'\)/u);

  // --- N-11: rate limit on refresh and logout -----------------------------
  const authController = read('modules/auth/auth.controller.ts');
  const authModule = read('modules/auth/auth.module.ts');
  const rateGuard = read('redis/redis-rate-limit.guard.ts');
  assert.equal(
    (authController.match(/@UseGuards\(AuthSessionRateLimitGuard\)/gu) ?? []).length,
    2,
    'N-11: both refresh and logout must be rate limited',
  );
  assert.match(authModule, /AuthSessionRateLimitGuard,/u);
  assert.match(rateGuard, /AUTH_SESSION_RATE_LIMIT_POLICY/u);
  assert.match(rateGuard, /RATE_LIMIT_AUTH_SESSION_MAX/u);

  // --- N-13: single source of truth for the admin privilege --------------
  const authorizationPolicy = read('common/auth/authorization-policy.util.ts');
  assert.match(authorizationPolicy, /export const isSystemAdmin/u);
  const policyImports: string[] = [];
  for (const file of walkTs(SRC)) {
    if (file.endsWith('.spec.ts')) continue;
    if (file.endsWith('authorization-policy.util.ts')) continue;
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(
      source,
      /\.role\s*===?\s*(?:'admin'|UserRole\.admin)/u,
      `N-13: raw admin-role comparison in ${file}; use isSystemAdmin()`,
    );
    if (source.includes('isSystemAdmin(')) policyImports.push(file);
  }
  assert.ok(policyImports.length >= 15, `N-13: expected >= 15 policy consumers, got ${policyImports.length}`);

  // --- N-14: named advisory locks -----------------------------------------
  const advisoryLocks = read('common/database/advisory-locks.util.ts');
  assert.match(advisoryLocks, /ADVISORY_LOCK_NAMESPACE/u);
  assert.match(advisoryLocks, /categoryTree/u);
  assert.match(advisoryLocks, /setupBootstrap/u);
  const categories = read('modules/categories/categories.service.ts');
  const setupBootstrap = read('modules/setup/setup-bootstrap.service.ts');
  assert.match(categories, /advisoryLockSql\(ADVISORY_LOCKS\.categoryTree\)/u);
  assert.match(setupBootstrap, /advisoryLockSql\(ADVISORY_LOCKS\.setupBootstrap\)/u);
  for (const file of walkTs(SRC)) {
    if (file.endsWith('advisory-locks.util.ts')) continue;
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /pg_advisory_xact_lock\(1800043170/u,
      `N-14: magic advisory-lock literal in ${file}`,
    );
  }

  // --- N-15: service decomposition gate -----------------------------------
  const constantsFile = resolve(SRC, 'modules/inventory-count/inventory-count.constants.ts');
  assert.ok(existsSync(constantsFile), 'N-15: extracted constants module must exist');
  assert.match(inventoryCount, /from '\.\/inventory-count\.constants'/u);
  const serviceLines = inventoryCount.split(/\r?\n/u).length;
  assert.ok(
    serviceLines <= 3000,
    `N-15: InventoryCountService grew back to ${serviceLines} lines (cap 3000)`,
  );
  assert.ok(
    readFileSync(constantsFile, 'utf8').split(/\r?\n/u).length >= 100,
    'N-15: extracted constants module must carry real weight',
  );
  const characterizedSpecs = walkTs(SRC).filter((file) =>
    file.endsWith('.characterization.spec.ts'),
  );
  assert.ok(characterizedSpecs.length >= 7, 'N-15: characterization safety net must remain');

  // --- Deployment automation ---------------------------------------------
  assert.match(mainTs, /resolveTrustProxyHops\(process\.env\)/u, 'proxy chain must be configurable');
  assert.match(repoRead('scripts/load-test.mjs'), /evaluateSlo/u, 'load-test SLO harness required');
  assert.ok(existsSync(resolve(ROOT, '..', 'scripts/load-test.spec.mjs')));
  assert.ok(existsSync(resolve(ROOT, '..', 'docs/load-testing.md')));
  const aclCheck = readFileSync(resolve(ROOT, 'prisma/check-redis-acl-channels.ts'), 'utf8');
  assert.match(
    aclCheck,
    /canonical ACL GETUSER must contain every required channel pattern/u,
    'live ACL checker must assert all channel grants',
  );

  console.log(
    `Independent audit findings gate passed (N-5..N-8 durable/bounded paths, N-9 typed queries + UUID pipe, N-10 fail-closed TTL, N-11 refresh/logout rate limit, N-12 7 characterized services, N-13 ${policyImports.length} central-policy consumers, N-14 named advisory locks, N-15 ${serviceLines}-line service, deployment harness/trust-proxy/live-ACL gates).`,
  );
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
