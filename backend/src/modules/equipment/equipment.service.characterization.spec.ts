import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { EquipmentService } from './equipment.service';

const source = readFileSync(resolve('src/modules/equipment/equipment.service.ts'), 'utf8');
const makeService = (overrides: Record<string, unknown> = {}) => {
  const calls = { findMany: 0, count: 0, disposal: 0 };
  const prisma = {
    equipment: {
      findMany: async (args: { take?: number }) => {
        calls.findMany += 1;
        assert.ok(args.take);
        return [{ id: 'eq1', status: 'za_rashod', notes: null }];
      },
      count: async () => { calls.count += 1; return 0; },
    },
    equipmentDisposalListItem: { findMany: async () => { calls.disposal += 1; return []; } },
  };
  const settings = {
    assertFeatureEnabled: async () => undefined,
    getNumberValue: async () => 25,
  };
  const service = new EquipmentService(
    prisma as never,
    {} as never,
    { buildEquipmentWhere: async () => ({}) } as never,
    { isModerator: () => false, buildScopedEquipmentWhere: async () => null } as never,
    {} as never,
    {} as never,
    {} as never,
    settings as never,
  );
  return { service, calls, overrides };
};

test('equipment list characterises bounded pagination and one batched disposal lookup', async () => {
  const { service, calls } = makeService();
  const result = await service.findAll({ id: 'u1', role: 'admin' } as never, { page: 2, pageSize: 25 } as never);
  assert.equal(calls.findMany, 1);
  assert.equal(calls.count, 1);
  assert.equal(calls.disposal, 1, 'disposal reasons must be fetched in one batch, not per row');
  assert.equal(result.meta.page, 2);
});

test('equipment service has no raw console logging and uses cursor paging for export', () => {
  assert.doesNotMatch(source, /\bconsole\./u);
  assert.match(source, /iterateCursorPages\(/u);
  assert.match(source, /\b500\b/u);
});
