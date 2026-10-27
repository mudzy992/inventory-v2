import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { PUBLIC_EQUIPMENT_FIXTURE, verifyPublicEquipmentShape } from './public-equipment.contract';
import { PublicEquipmentService } from './public-equipment.service';

interface OrgUnitRow {
  id: string;
  name: string;
  parentId: string | null;
}

const makeTransfer = (index: number) => ({
  id: `t${index}`,
  date: new Date(`2026-10-0${index + 1}T00:00:00.000Z`),
  createdAt: new Date(`2026-10-0${index + 1}T00:00:00.000Z`),
  type: 'zaduzenje',
  status: 'finalized',
  fromType: 'skladiste',
  fromPersonId: null,
  fromWarehouseId: 'w1',
  fromPerson: null,
  fromWarehouse: { id: 'w1', name: 'Glavno' },
  toType: 'osoba',
  toPersonId: 'e1',
  toWarehouseId: null,
  toPerson: { id: 'e1', firstName: 'Ana', lastName: 'Anić' },
  toWarehouse: null,
  documentNumber: `TR-${index}`,
});

const equipmentFixture = () => ({
  id: 'equipment-1',
  inventoryNumber: 'INV-0001',
  isAccountingTracked: true,
  status: 'zaduzeno',
  notes: null,
  specifications: { sn: 'SN-1' },
  category: {
    name: 'Laptop',
    fields: [{ id: 'sn', name: 'Serijski broj', unique: true }],
    optionalFields: [],
  },
  stockLot: null,
  currentHolder: {
    id: 'e1',
    firstName: 'Ana',
    lastName: 'Anić',
    title: 'Referent',
    orgUnitId: 'ou2',
    orgUnit: { id: 'ou2', name: 'Sektor' },
  },
  warehouse: null,
  transfers: [makeTransfer(0), makeTransfer(1), makeTransfer(2)],
});

const orgUnits = new Map<string, OrgUnitRow>([
  ['ou1', { id: 'ou1', name: 'Direkcija', parentId: null }],
  ['ou2', { id: 'ou2', name: 'Sektor', parentId: 'ou1' }],
]);

interface Harness {
  service: PublicEquipmentService;
  captured: { take?: number; wholeOrgTreeLoaded: number; orgUnitLookups: string[] };
  setEnabled: (value: boolean) => void;
}

const createHarness = (): Harness => {
  let enabled = true;
  const captured = { take: undefined as number | undefined, wholeOrgTreeLoaded: 0, orgUnitLookups: [] as string[] };
  const prisma = {
    equipment: {
      findUnique: async (args: { include?: { transfers?: { take?: number } } }) => {
        captured.take = args.include?.transfers?.take;
        const take = args.include?.transfers?.take ?? Number.MAX_SAFE_INTEGER;
        const fixture = equipmentFixture();
        return { ...fixture, transfers: fixture.transfers.slice(0, take) };
      },
    },
    orgUnit: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        captured.orgUnitLookups.push(where.id);
        return orgUnits.get(where.id) ?? null;
      },
      findMany: async () => {
        captured.wholeOrgTreeLoaded += 1;
        return [];
      },
    },
    equipmentDisposalListItem: {
      findFirst: async () => null,
      findMany: async () => [],
    },
  };
  const settings = { isFeatureEnabled: async () => enabled };
  const redis = {
    remember: async <T>(_key: string, _ttl: number, loader: () => Promise<T>): Promise<T> => loader(),
  };
  return {
    service: new PublicEquipmentService(prisma as never, settings as never, redis as never),
    captured,
    setEnabled: (value) => {
      enabled = value;
    },
  };
};

const withEnv = async <T>(value: string | undefined, work: () => Promise<T>): Promise<T> => {
  const previous = process.env.PUBLIC_EQUIPMENT_MAX_MOVEMENTS;
  if (value === undefined) delete process.env.PUBLIC_EQUIPMENT_MAX_MOVEMENTS;
  else process.env.PUBLIC_EQUIPMENT_MAX_MOVEMENTS = value;
  try {
    return await work();
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_EQUIPMENT_MAX_MOVEMENTS;
    else process.env.PUBLIC_EQUIPMENT_MAX_MOVEMENTS = previous;
  }
};

test('the real service returns the frozen, reviewed DTO shape', async () => {
  await withEnv(undefined, async () => {
    const { service, captured } = createHarness();
    const response = await service.findOne('equipment-1');
    assert.deepEqual(verifyPublicEquipmentShape(response), []);
    assert.deepEqual(Object.keys(response).sort(), Object.keys(PUBLIC_EQUIPMENT_FIXTURE).sort());
    assert.equal(response.currentHolder?.fullName, 'Ana Anić');
    assert.equal(response.movements.length, 3);
    assert.equal(captured.take, 200, 'the default cap must be pushed into the Prisma query');
  });
});

test('PUBLIC_EQUIPMENT_MAX_MOVEMENTS bounds the published history', async () => {
  await withEnv('2', async () => {
    const { service, captured } = createHarness();
    const response = await service.findOne('equipment-1');
    assert.equal(captured.take, 2);
    assert.equal(response.movements.length, 2);
    assert.deepEqual(verifyPublicEquipmentShape(response), []);
  });
});

test('only the holder ancestor chain is loaded, never the whole org tree', async () => {
  await withEnv(undefined, async () => {
    const { service, captured } = createHarness();
    const response = await service.findOne('equipment-1');
    assert.equal(captured.wholeOrgTreeLoaded, 0);
    assert.deepEqual(captured.orgUnitLookups, ['ou2', 'ou1']);
    assert.equal(response.currentHolder?.orgUnitPath, 'Direkcija → Sektor');
  });
});

test('an invalid cap fails service construction instead of silently publishing everything', async () => {
  await withEnv('nope', async () => {
    assert.throws(() => createHarness(), /must be an integer between/u);
  });
  await withEnv('0', async () => {
    assert.throws(() => createHarness(), /must be an integer between/u);
  });
});

test('the feature flag still disables the public endpoint', async () => {
  await withEnv(undefined, async () => {
    const { service, setEnabled } = createHarness();
    setEnabled(false);
    await assert.rejects(service.findOne('equipment-1'), NotFoundException);
  });
});
