import assert from 'node:assert/strict';
import test from 'node:test';
import { WarehouseResolutionService } from './warehouse-resolution.service';
import { SCOPE_CACHE_TTL_MS, getScopeCacheVersion, invalidateScopeCaches } from './scope-cache.registry';

interface Harness {
  service: WarehouseResolutionService;
  calls: () => { orgUnits: number; warehouses: number; employees: number };
}

const makeHarness = (): Harness => {
  const counts = { orgUnits: 0, warehouses: 0, employees: 0 };
  const orgUnits = [
    { id: 'root', parentId: null, locationCityId: null, effectiveLocationCityId: null },
    { id: 'branch', parentId: 'root', locationCityId: 'city-1', effectiveLocationCityId: 'city-1' },
  ];
  const warehouses = [
    {
      id: 'wh-1',
      orgUnitId: 'root',
      cityId: 'city-1',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];
  const prisma = {
    orgUnit: {
      findMany: async () => {
        counts.orgUnits += 1;
        return orgUnits;
      },
    },
    warehouse: {
      findMany: async () => {
        counts.warehouses += 1;
        return warehouses;
      },
    },
    employee: {
      findMany: async (args: { where: { orgUnitId: { in: string[] } }; take?: number }) => {
        counts.employees += 1;
        assert.ok(args.take, 'employee lookup must be bounded');
        return args.where.orgUnitId.in.map((orgUnitId) => ({ id: `emp-${orgUnitId}` }));
      },
      findUnique: async ({ where }: { where: { id: string } }) => ({
        orgUnitId: where.id === 'e1' ? 'branch' : 'root',
      }),
    },
  };
  const service = new WarehouseResolutionService(prisma as never, {
    getEffectiveLocationForOrgUnit: async () => null,
  } as never);
  return { service, calls: () => ({ ...counts }) };
};

test('N-5: the org/warehouse graph is loaded once per TTL/version, not per call', async () => {
  const h = makeHarness();
  await h.service.resolveForOrgUnit('branch');
  await h.service.resolveForOrgUnit('branch');
  await h.service.resolveForEmployee('e1');
  assert.equal(h.calls().orgUnits, 1);
  assert.equal(h.calls().warehouses, 1);

  invalidateScopeCaches();
  await h.service.resolveForOrgUnit('branch');
  assert.equal(h.calls().orgUnits, 2, 'a write-path bump must reload the graph');
  assert.ok(getScopeCacheVersion() > 0);
});

test('N-5: the graph expires after the TTL even without an explicit bump', async () => {
  const h = makeHarness();
  await h.service.resolveForOrgUnit('branch');
  const realNow = Date.now;
  Date.now = () => realNow() + SCOPE_CACHE_TTL_MS + 1;
  try {
    await h.service.resolveForOrgUnit('branch');
    assert.equal(h.calls().orgUnits, 2);
  } finally {
    Date.now = realNow;
  }
});

test('N-5: a whole-warehouse employee lookup is ONE bounded query', async () => {
  const h = makeHarness();
  const ids = await h.service.findEmployeeIdsForWarehouse('wh-1');
  assert.deepEqual(ids.sort(), ['emp-branch', 'emp-root']);
  assert.equal(h.calls().employees, 1, 'no per-employee resolveForEmployee loop');
  assert.equal(h.calls().orgUnits, 1);
});

test('N-5: an unknown warehouse short-circuits without an employee query', async () => {
  const h = makeHarness();
  assert.deepEqual(await h.service.findEmployeeIdsForWarehouse('missing'), []);
  assert.equal(h.calls().employees, 0);
});

test('N-5: resolveForOrgUnit still honours an explicit city override', async () => {
  const h = makeHarness();
  const resolved = await h.service.resolveForOrgUnit('root', 'city-1');
  assert.equal(resolved, 'wh-1');
});
