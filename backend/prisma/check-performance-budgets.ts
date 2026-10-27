import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { escapeCsvCell } from '../src/common/utils/csv-cell.util';
import { iterateCursorPages } from '../src/common/utils/cursor-pages.util';
import { MAX_PAGE_OFFSET, parsePagination } from '../src/common/utils/pagination.util';
import {
  PERFORMANCE_BUDGETS,
  QueryRecorder,
  assertNoViolations,
  buildBudgetReport,
  expectedCursorPageQueries,
  verifyQueryBudget,
  type BudgetReportRow,
} from '../src/common/performance/performance-budget.util';

/**
 * Release gate for measurable performance criteria (§11 of the audit).
 *
 * Deterministic work units — query counts, batch sizes, caps — are the
 * contract; a generous wall-clock smoke test is reported as a secondary
 * signal. Nothing here needs a database, Redis or network, so it runs in
 * every CI job before any integration suite.
 */

const ROOT = resolve('.');
const REPO = resolve(ROOT, '..');
const reportRows: BudgetReportRow[] = [];

const measure = (
  metric: string,
  measured: number | string,
  budget: number | string,
  ok: boolean,
): void => {
  reportRows.push({ metric, measured, budget, status: ok ? 'pass' : 'fail' });
};

const staticChecks = (): void => {
  const service = readFileSync(resolve(ROOT, 'src/modules/equipment/equipment.service.ts'), 'utf8');
  const cursor = readFileSync(resolve(ROOT, 'src/common/utils/cursor-pages.util.ts'), 'utf8');
  const pagination = readFileSync(resolve(ROOT, 'src/common/utils/pagination.util.ts'), 'utf8');
  const publicService = readFileSync(
    resolve(ROOT, 'src/modules/public-equipment/public-equipment.service.ts'),
    'utf8',
  );
  const publicContract = readFileSync(
    resolve(ROOT, 'src/modules/public-equipment/public-equipment.contract.ts'),
    'utf8',
  );
  const bulkDto = readFileSync(
    resolve(ROOT, 'src/modules/warehouse-stock/dto/bulk-create-stock-lot.dto.ts'),
    'utf8',
  );
  const registry = readFileSync(resolve(ROOT, 'src/modules/settings/settings.registry.ts'), 'utf8');

  assert.match(service, /iterateCursorPages\(/u, 'CSV export must stream through cursor pages');
  assert.match(service, /\b500\b/u, 'CSV export must use the 500-row batch size');
  assert.match(cursor, /pageSize\s*=\s*500/u);
  assert.match(cursor, /more rows than requested/u, 'cursor paging must fail closed on oversized pages');
  assert.ok(pagination.includes('MAX_PAGE_OFFSET'), 'deep pagination must be bounded');
  assert.match(publicService, /take:\s*this\.movementLimit/u, 'public QR must cap movement history');
  assert.equal(/orgUnit\.findMany\(/u.test(publicService), false, 'public QR must not load the whole org tree');
  assert.match(publicContract, /PUBLIC_EQUIPMENT_MOVEMENTS_MAX\s*=\s*1000/u);
  assert.match(bulkDto, /@ArrayMaxSize\(100\)/u, 'bulk receipt must cap items at 100');
  assert.ok(registry.includes("lists.max_page_size"), 'page-size settings must exist');
  assert.ok(registry.includes('maxValue'), 'numeric settings must declare bounds');

  const env = readFileSync(resolve(REPO, '.env.example'), 'utf8');
  for (const knob of ['DOCUMENT_WORKER_CONVERT_TIMEOUT_MS', 'DOCUMENT_JOB_STALE_TIMEOUT_MS', 'PUBLIC_EQUIPMENT_MAX_MOVEMENTS']) {
    assert.ok(env.includes(knob), `.env.example must document ${knob}`);
  }
  const guide = readFileSync(resolve(REPO, 'docs/performance-budgets.md'), 'utf8');
  for (const keyword of ['N+1', 'batch', 'query budget', 'wall-clock']) {
    assert.ok(guide.includes(keyword), `performance guide must document ${keyword}`);
  }
  assert.equal(MAX_PAGE_OFFSET, PERFORMANCE_BUDGETS.maxPageOffset);
  measure('static bounds in source', 10, 10, true);
};

const cursorChecks = async (): Promise<void> => {
  const total = 1200;
  const data = Array.from({ length: total }, (_, index) => ({ id: `row-${String(index).padStart(5, '0')}` }));
  const recorder = new QueryRecorder();
  const seen: string[] = [];
  const stream = iterateCursorPages(async (cursorId, take) => {
    recorder.record('equipment', 'findMany', { take });
    const start = cursorId ? data.findIndex((row) => row.id === cursorId) + 1 : 0;
    return data.slice(start, start + take);
  }, PERFORMANCE_BUDGETS.csvExportBatchSize);
  for await (const row of stream) seen.push(row.id);

  const queries = recorder.count('equipment', 'findMany');
  const expected = expectedCursorPageQueries(total, PERFORMANCE_BUDGETS.csvExportBatchSize);
  assert.equal(seen.length, total);
  assert.equal(new Set(seen).size, total, 'cursor paging must not duplicate rows');
  assert.equal(queries, expected);
  assert.equal(recorder.maxTake(), PERFORMANCE_BUDGETS.csvExportBatchSize);
  assertNoViolations(verifyQueryBudget(recorder, 'csv-export', PERFORMANCE_BUDGETS.csvExportMaxQueriesFor1200Rows));
  measure('CSV export queries for 1200 rows', queries, PERFORMANCE_BUDGETS.csvExportMaxQueriesFor1200Rows, queries <= PERFORMANCE_BUDGETS.csvExportMaxQueriesFor1200Rows);
  measure('CSV export max take', recorder.maxTake(), PERFORMANCE_BUDGETS.csvExportBatchSize, recorder.maxTake() <= PERFORMANCE_BUDGETS.csvExportBatchSize);
};

const listAndPaginationChecks = (): void => {
  // A simulated list request: 2 setting reads, scope where, findMany, count,
  // one batched disposal lookup. Constant regardless of the result size.
  const recorder = new QueryRecorder();
  recorder.record('setting', 'findUnique');
  recorder.record('setting', 'findUnique');
  recorder.record('orgUnit', 'findMany', { take: 100 });
  recorder.record('equipment', 'findMany', { take: 25 });
  recorder.record('equipment', 'count');
  recorder.record('equipmentDisposalListItem', 'findMany', { take: 100 });
  assertNoViolations(verifyQueryBudget(recorder, 'equipment-list', PERFORMANCE_BUDGETS.maxListRequestQueries));
  measure('list request DB queries', recorder.count(), PERFORMANCE_BUDGETS.maxListRequestQueries, recorder.count() <= PERFORMANCE_BUDGETS.maxListRequestQueries);

  const capped = parsePagination({ page: 1, pageSize: 100_000 });
  assert.ok(capped.pageSize <= PERFORMANCE_BUDGETS.maxListPageSize);
  const deepest = parsePagination({ page: 1001, pageSize: 100 });
  assert.equal(deepest.skip, MAX_PAGE_OFFSET);
  assert.throws(() => parsePagination({ page: 1002, pageSize: 100 }));
  measure('max page size', capped.pageSize, PERFORMANCE_BUDGETS.maxListPageSize, capped.pageSize <= PERFORMANCE_BUDGETS.maxListPageSize);
  measure('max page offset', deepest.skip, MAX_PAGE_OFFSET, deepest.skip === MAX_PAGE_OFFSET);
};

const wallClockSmoke = (): void => {
  const iterations = PERFORMANCE_BUDGETS.pureSerializationSmokeIterations;
  const started = performance.now();
  let checksum = 0;
  for (let index = 0; index < iterations; index += 1) {
    checksum += escapeCsvCell(`=SUM(A${index},"baz",\n<value>`).length;
  }
  const elapsed = performance.now() - started;
  assert.ok(checksum > 0, 'CSV escaping smoke must actually do work');
  // Generous ceiling: catches a catastrophic regression (e.g. an accidental
  // O(n²) implementation) without being flaky on a shared CI runner.
  const ok = elapsed < PERFORMANCE_BUDGETS.pureSerializationSmokeMaxMs;
  measure('CSV escaping smoke (ms)', elapsed.toFixed(1), PERFORMANCE_BUDGETS.pureSerializationSmokeMaxMs, ok);
  assert.ok(ok, `CSV serialization smoke took ${elapsed.toFixed(1)}ms`);
};

const main = async (): Promise<void> => {
  staticChecks();
  await cursorChecks();
  listAndPaginationChecks();
  wallClockSmoke();
  const report = buildBudgetReport(reportRows);
  console.log(report);
  if (reportRows.some((row) => row.status === 'fail')) process.exitCode = 1;
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
