import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { iterateCursorPages } from '../utils/cursor-pages.util';
import { MAX_PAGE_OFFSET, parsePagination } from '../utils/pagination.util';
import { BulkCreateStockLotDto } from '../../modules/warehouse-stock/dto/bulk-create-stock-lot.dto';
import { PublicEquipmentService } from '../../modules/public-equipment/public-equipment.service';
import {
  PUBLIC_EQUIPMENT_MOVEMENTS_MAX,
  resolvePublicEquipmentMovementLimit,
} from '../../modules/public-equipment/public-equipment.contract';
import {
  PERFORMANCE_BUDGETS,
  QueryRecorder,
  assertNoViolations,
  buildBudgetReport,
  expectedCursorPageQueries,
  verifyQueryBudget,
} from './performance-budget.util';

const rows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `row-${String(index).padStart(5, '0')}` }));

test('budgets are internally consistent and leave headroom', () => {
  assert.equal(PERFORMANCE_BUDGETS.csvExportBatchSize, 500);
  assert.ok(PERFORMANCE_BUDGETS.maxListPageSize >= PERFORMANCE_BUDGETS.csvExportBatchSize);
  assert.equal(PERFORMANCE_BUDGETS.maxPageOffset, MAX_PAGE_OFFSET);
  assert.equal(PERFORMANCE_BUDGETS.bulkReceiptMaxItems, 100);
  assert.equal(PERFORMANCE_BUDGETS.maxPublicQrMovements, PUBLIC_EQUIPMENT_MOVEMENTS_MAX);
  assert.equal(
    resolvePublicEquipmentMovementLimit(undefined),
    PERFORMANCE_BUDGETS.defaultPublicQrMovements,
  );
  assert.ok(
    PERFORMANCE_BUDGETS.documentJobStaleBoundMs >
      PERFORMANCE_BUDGETS.documentWorkerConvertTimeoutMs + 30_000,
  );
});

test('QueryRecorder records, filters, tracks max take and resets', () => {
  const recorder = new QueryRecorder();
  recorder.record('equipment', 'findMany', { take: 500 });
  recorder.record('equipment', 'findMany', { take: 200 });
  recorder.record('setting', 'findUnique');
  assert.equal(recorder.count(), 3);
  assert.equal(recorder.count('equipment', 'findMany'), 2);
  assert.equal(recorder.maxTake(), 500);
  recorder.reset();
  assert.equal(recorder.count(), 0);
});

test('cursor page query count is deterministic (no N+1)', () => {
  assert.equal(expectedCursorPageQueries(0, 500), 1);
  assert.equal(expectedCursorPageQueries(1, 500), 1);
  assert.equal(expectedCursorPageQueries(500, 500), 1);
  assert.equal(expectedCursorPageQueries(501, 500), 2);
  assert.equal(expectedCursorPageQueries(1200, 500), 3);
  assert.equal(expectedCursorPageQueries(1200, 500), PERFORMANCE_BUDGETS.csvExportMaxQueriesFor1200Rows);
  assert.throws(() => expectedCursorPageQueries(-1, 500), RangeError);
  assert.throws(() => expectedCursorPageQueries(10, 0), RangeError);
});

test('verifyQueryBudget rejects over-budget, unbounded and oversized queries', () => {
  const bounded = new QueryRecorder();
  bounded.record('equipment', 'findMany', { take: 500 });
  bounded.record('equipment', 'count');
  assert.deepEqual(verifyQueryBudget(bounded, 'list', 8), []);
  assert.deepEqual(verifyQueryBudget(bounded, 'list', 1).length, 1);

  const unbounded = new QueryRecorder();
  unbounded.record('equipment', 'findMany');
  assert.ok(verifyQueryBudget(unbounded, 'export', 10).some((v) => v.message.includes('unbounded')));

  const oversized = new QueryRecorder();
  oversized.record('equipment', 'findMany', { take: 50_000 });
  assert.ok(verifyQueryBudget(oversized, 'export', 10).some((v) => v.message.includes('page-size budget')));
});

test('assertNoViolations produces a readable, labelled failure', () => {
  assert.doesNotThrow(() => assertNoViolations([]));
  assert.throws(
    () => assertNoViolations([{ label: 'qr', message: 'too many queries' }]),
    /\[qr\] too many queries/u,
  );
});

test('CSV export of 1200 rows uses exactly 3 constant-size batches', async () => {
  const data = rows(1200);
  const recorder = new QueryRecorder();
  const seen: string[] = [];
  const stream = iterateCursorPages(async (cursorId, take) => {
    recorder.record('equipment', 'findMany', { take });
    const start = cursorId ? data.findIndex((row) => row.id === cursorId) + 1 : 0;
    return data.slice(start, start + take);
  }, PERFORMANCE_BUDGETS.csvExportBatchSize);
  for await (const row of stream) seen.push(row.id);

  assert.equal(seen.length, 1200);
  assert.equal(new Set(seen).size, 1200, 'no duplicate rows across cursor pages');
  assert.deepEqual(seen.slice(0, 2), ['row-00000', 'row-00001']);
  assert.equal(recorder.count('equipment', 'findMany'), 3);
  assert.equal(recorder.maxTake(), 500, 'no batch may exceed the configured size');
  assert.deepEqual(verifyQueryBudget(recorder, 'csv-export', PERFORMANCE_BUDGETS.csvExportMaxQueriesFor1200Rows), []);
});

test('cursor paging fails closed on invalid page size or oversized page', async () => {
  await assert.rejects(
    (async () => {
      for await (const _row of iterateCursorPages(async () => [], 0)) void _row;
    })(),
    RangeError,
  );
  await assert.rejects(
    (async () => {
      for await (const _row of iterateCursorPages(async () => rows(3), 2)) void _row;
    })(),
    /more rows than requested/u,
  );
});

test('deep pagination and oversized page requests stay bounded', () => {
  const capped = parsePagination({ page: 1, pageSize: 100_000 });
  assert.ok(capped.pageSize <= PERFORMANCE_BUDGETS.maxListPageSize);
  const last = parsePagination({ page: 1001, pageSize: 100 });
  assert.equal(last.skip, MAX_PAGE_OFFSET);
  assert.throws(() => parsePagination({ page: 1002, pageSize: 100 }));
});

test('bulk stock receipt enforces the 100-item budget', async () => {
  const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const make = (count: number) =>
    plainToInstance(BulkCreateStockLotDto, {
      items: Array.from({ length: count }, () => ({
        categoryId: uuid,
        catalogItemId: uuid,
        quantity: 1,
        entryDate: '2026-10-27T00:00:00.000Z',
      })),
    });
  assert.equal((await validate(make(100), { whitelist: true, forbidNonWhitelisted: true })).length, 0);
  assert.notEqual((await validate(make(101), { whitelist: true, forbidNonWhitelisted: true })).length, 0);
});

test('public QR lookup issues bounded queries even with 250 transfers', async () => {
  const recorder = new QueryRecorder();
  const orgUnits = new Map(
    Array.from({ length: 25 }, (_, index) => [
      `ou-${index}`,
      { id: `ou-${index}`, name: `Unit ${index}`, parentId: index === 0 ? null : `ou-${index - 1}` },
    ]),
  );
  const transfers = Array.from({ length: 250 }, (_, index) => ({
    id: `t-${index}`,
    date: new Date('2026-01-01T00:00:00.000Z'),
    type: 'zaduzenje',
    status: 'finalized',
    fromType: 'skladiste',
    fromPersonId: null,
    fromWarehouseId: null,
    fromPerson: null,
    fromWarehouse: null,
    toType: 'osoba',
    toPersonId: null,
    toWarehouseId: null,
    toPerson: null,
    toWarehouse: null,
    documentNumber: `TR-${index}`,
  }));
  const prisma = {
    equipment: {
      findUnique: async (args: { include?: { transfers?: { take?: number } } }) => {
        recorder.record('equipment', 'findUnique');
        const take = args.include?.transfers?.take ?? transfers.length;
        return {
          id: 'eq-1',
          inventoryNumber: 'INV-1',
          isAccountingTracked: true,
          status: 'zaduzeno',
          notes: null,
          specifications: {},
          category: { name: 'Laptop', fields: [], optionalFields: [] },
          stockLot: null,
          warehouse: null,
          currentHolder: {
            id: 'e1',
            firstName: 'Ana',
            lastName: 'Anić',
            title: 'Referent',
            orgUnitId: 'ou-24',
            orgUnit: { id: 'ou-24', name: 'Unit 24' },
          },
          transfers: transfers.slice(0, take),
        };
      },
    },
    orgUnit: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        recorder.record('orgUnit', 'findUnique');
        return orgUnits.get(where.id) ?? null;
      },
      findMany: async () => {
        recorder.record('orgUnit', 'findMany', { take: 25 });
        return [...orgUnits.values()];
      },
    },
    equipmentDisposalListItem: { findFirst: async () => null },
  };
  const settings = { isFeatureEnabled: async () => true };
  const redis = {
    remember: async <T>(_key: string, _ttl: number, loader: () => Promise<T>): Promise<T> => loader(),
  };
  const service = new PublicEquipmentService(prisma as never, settings as never, redis as never);
  const response = await service.findOne('eq-1');

  assert.equal(response.movements.length, PERFORMANCE_BUDGETS.defaultPublicQrMovements);
  assert.equal(recorder.count('orgUnit', 'findMany'), 0, 'must never load the whole org tree');
  assert.ok(recorder.count('orgUnit', 'findUnique') <= PERFORMANCE_BUDGETS.maxOrgUnitPathDepth);
  assert.ok(recorder.count() <= PERFORMANCE_BUDGETS.maxPublicQrQueries);
  assert.equal(response.currentHolder?.orgUnitPath.split(' → ').length, PERFORMANCE_BUDGETS.maxPublicQrMovements > 0 ? 20 : 0);
  assert.deepEqual(verifyQueryBudget(recorder, 'public-qr', PERFORMANCE_BUDGETS.maxPublicQrQueries), []);
});

test('budget report lists every metric and a clear verdict', () => {
  const report = buildBudgetReport([
    { metric: 'csv queries', measured: 3, budget: 3, status: 'pass' },
    { metric: 'qr queries', measured: 26, budget: 25, status: 'fail' },
  ]);
  assert.match(report, /FAIL \(1\/2 within budget\)/u);
  assert.match(report, /\[FAIL\] qr queries: measured 26, budget 25/u);
});
