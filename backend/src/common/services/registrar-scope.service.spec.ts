import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { Equipment, Employee, UserRole } from '../../../generated/prisma/client';
import { RegistrarScopeService } from './registrar-scope.service';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import type { RegistrarScopeAssignment } from '../types/registrar-scope.type';

const categories = [
  { id: 'cat-root', parentId: null },
  { id: 'cat-child', parentId: 'cat-root' },
];

const orgUnitRows = [
  { id: 'ou-root', parentId: null },
  { id: 'ou-child', parentId: 'ou-root' },
  { id: 'ou-other', parentId: null },
  { id: 'ed-zenica', parentId: 'ou-root' },
  { id: 'sluzba-ed', parentId: 'ed-zenica' },
  { id: 'sluzba-dir', parentId: 'ou-root' },
];

const orgUnits = [
  { id: 'ou-root', parentId: null, effectiveLocationCityId: 'city-a', locationCityId: null },
  { id: 'ou-child', parentId: 'ou-root', effectiveLocationCityId: 'city-a', locationCityId: null },
  { id: 'ou-other', parentId: null, effectiveLocationCityId: 'city-b', locationCityId: null },
  { id: 'ed-zenica', parentId: 'ou-root', effectiveLocationCityId: 'city-zenica', locationCityId: null },
  { id: 'sluzba-ed', parentId: 'ed-zenica', effectiveLocationCityId: 'city-zenica', locationCityId: null },
  { id: 'sluzba-dir', parentId: 'ou-root', effectiveLocationCityId: 'city-a', locationCityId: null },
];

const warehouseRows = [
  {
    id: 'wh-a',
    orgUnitId: 'ou-root',
    cityId: 'city-a',
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'wh-b',
    orgUnitId: 'ou-other',
    cityId: 'city-b',
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'wh-central',
    orgUnitId: 'ou-root',
    cityId: 'city-a',
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'wh-ed',
    orgUnitId: 'ed-zenica',
    cityId: 'city-zenica',
    isActive: true,
    createdAt: '2024-01-02',
  },
];

const warehouses: Record<
  string,
  { id: string; cityId: string; orgUnitId: string | null }
> = {
  'wh-a': { id: 'wh-a', cityId: 'city-a', orgUnitId: 'ou-root' },
  'wh-b': { id: 'wh-b', cityId: 'city-b', orgUnitId: 'ou-other' },
  'wh-central': { id: 'wh-central', cityId: 'city-a', orgUnitId: 'ou-root' },
  'wh-ed': { id: 'wh-ed', cityId: 'city-zenica', orgUnitId: 'ed-zenica' },
};

const expandOrgSubtree = (rootId: string): string[] => {
  const result = new Set<string>();
  const visit = (id: string): void => {
    if (result.has(id)) {
      return;
    }
    result.add(id);
    for (const unit of orgUnitRows.filter((row) => row.parentId === id)) {
      visit(unit.id);
    }
  };
  visit(rootId);
  return [...result];
};

const authUser = (
  role: UserRole,
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser => ({
  id: `${role}-user`,
  username: role,
  role,
  employeeId: role === 'user' ? 'emp-user' : null,
  registrarScopes: [],
  coordinatorAssignments: [],
  moderatorOrgRoots: [],
  moderatorWarehouseIds: [],
  ...overrides,
});

const createService = (options?: {
  keeperWarehouseIds?: string[];
  actorEmployeeId?: string | null;
  scopedEquipmentIds?: string[];
  scopedEmployeeIds?: string[];
}) => {
  const prisma = {
    category: {
      findMany: async () => categories,
    },
    orgUnit: {
      findMany: async () => orgUnitRows,
    },
    warehouse: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        warehouses[where.id] ?? null,
      findMany: async () => warehouseRows,
    },
    warehouseKeeper: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        (options?.keeperWarehouseIds ?? []).map((warehouseId) => ({
          warehouseId,
          userId: where.userId,
        })),
    },
    equipment: {
      findMany: async () =>
        (options?.scopedEquipmentIds ?? []).map((id) => ({ id })),
    },
    employee: {
      findMany: async () =>
        (options?.scopedEmployeeIds ?? []).map((id) => ({ id })),
    },
    user: {
      findUnique: async () => ({ employeeId: options?.actorEmployeeId ?? null }),
    },
    registrarAssignment: {
      findMany: async () => [],
    },
  };

  const locationResolutionService = {
    getEffectiveLocationForOrgUnit: async (orgUnitId: string) => {
      const unit = orgUnits.find((row) => row.id === orgUnitId);
      return unit?.effectiveLocationCityId ?? unit?.locationCityId ?? null;
    },
  };

  const orgScopeService = {
    expandOrgUnitIds: async (rootIds: string[]) => {
      const merged = new Set<string>();
      for (const rootId of rootIds) {
        for (const id of expandOrgSubtree(rootId)) {
          merged.add(id);
        }
      }
      return [...merged];
    },
  };

  return new RegistrarScopeService(
    prisma as never,
    locationResolutionService as never,
    orgScopeService as never,
  );
};

describe('RegistrarScopeService', () => {
  describe('buildEquipmentWhere', () => {
    it('admin sees all equipment', async () => {
      const service = createService();
      const where = await service.buildEquipmentWhere(authUser('admin'));
      assert.deepEqual(where, {});
    });

    it('user sees only own assigned equipment', async () => {
      const service = createService();
      const where = await service.buildEquipmentWhere(authUser('user'));
      assert.deepEqual(where, { currentHolderId: 'emp-user' });
    });

    it('user without employeeId sees nothing', async () => {
      const service = createService();
      const where = await service.buildEquipmentWhere(
        authUser('user', { employeeId: null }),
      );
      assert.deepEqual(where, { id: { in: [] } });
    });

    it('skladistar sees stock on assigned warehouses', async () => {
      const service = createService({ keeperWarehouseIds: ['wh-a'] });
      const where = await service.buildEquipmentWhere(authUser('skladistar'));
      assert.deepEqual(where.warehouseId, { in: ['wh-a'] });
      assert.ok(Array.isArray(where.OR));
    });

    it('skladistar without warehouses sees nothing', async () => {
      const service = createService();
      const where = await service.buildEquipmentWhere(authUser('skladistar'));
      assert.deepEqual(where, { id: { in: [] } });
    });

    it('evidenticar mode A scopes warehouse stock and assigned holders', async () => {
      const service = createService();
      const assignment: RegistrarScopeAssignment = {
        warehouseId: 'wh-a',
        categoryId: 'cat-root',
      };
      const where = await service.buildEquipmentWhere(
        authUser('evidenticar', { registrarScopes: [assignment] }),
      );
      assert.ok(where.AND);
      const andClause = where.AND as Record<string, unknown>[];
      assert.equal(andClause.length, 2);
      const categoryFilter = andClause[0] as { categoryId: { in: string[] } };
      assert.ok(categoryFilter.categoryId.in.includes('cat-root'));
      assert.ok(categoryFilter.categoryId.in.includes('cat-child'));
    });

    it('evidenticar mode B scopes assigned org subtree', async () => {
      const service = createService();
      const assignment: RegistrarScopeAssignment = {
        warehouseId: 'wh-a',
        categoryId: 'cat-root',
        orgUnitId: 'ou-child',
      };
      const where = await service.buildEquipmentWhere(
        authUser('evidenticar', { registrarScopes: [assignment] }),
      );
      assert.ok(where.AND);
      const andClause = where.AND as Record<string, unknown>[];
      const statusFilter = andClause[1] as { status: string };
      assert.equal(statusFilter.status, 'zaduzeno');
    });

    it('evidenticar without scopes sees nothing', async () => {
      const service = createService();
      const where = await service.buildEquipmentWhere(authUser('evidenticar'));
      assert.deepEqual(where, { id: { in: [] } });
    });
  });

  describe('buildEmployeeWhere', () => {
    it('admin sees all employees', async () => {
      const service = createService();
      const where = await service.buildEmployeeWhere(authUser('admin'));
      assert.deepEqual(where, {});
    });

    it('user sees only self', async () => {
      const service = createService();
      const where = await service.buildEmployeeWhere(authUser('user'));
      assert.deepEqual(where, { id: 'emp-user' });
    });

    it('evidenticar mode A filters by effective warehouse org units', async () => {
      const service = createService();
      const where = await service.buildEmployeeWhere(
        authUser('evidenticar', {
          registrarScopes: [{ warehouseId: 'wh-a', categoryId: 'cat-root' }],
        }),
      );
      assert.ok((where as { orgUnitId: { in: string[] } }).orgUnitId.in.includes('ou-child'));
      assert.equal(
        (where as { orgUnitId: { in: string[] } }).orgUnitId.in.includes('sluzba-ed'),
        false,
      );
    });
  });

  describe('buildStockLotWhere', () => {
    it('admin sees all stock lots', async () => {
      const service = createService();
      const where = await service.buildStockLotWhere(authUser('admin'));
      assert.deepEqual(where, {});
    });

    it('skladistar sees no registrar stock lots', async () => {
      const service = createService();
      const where = await service.buildStockLotWhere(authUser('skladistar'));
      assert.deepEqual(where, { id: { in: [] } });
    });

    it('evidenticar mode A scopes warehouse and category tree', async () => {
      const service = createService();
      const where = await service.buildStockLotWhere(
        authUser('evidenticar', {
          registrarScopes: [{ warehouseId: 'wh-a', categoryId: 'cat-root' }],
        }),
      );
      assert.equal((where as { warehouseId: string }).warehouseId, 'wh-a');
      const categoryFilter = (where as { categoryId: { in: string[] } }).categoryId;
      assert.ok(categoryFilter.in.includes('cat-child'));
    });

    it('evidenticar mode B only assignment ignores stock lots', async () => {
      const service = createService();
      const where = await service.buildStockLotWhere(
        authUser('evidenticar', {
          registrarScopes: [
            { warehouseId: 'wh-a', categoryId: 'cat-root', orgUnitId: 'ou-child' },
          ],
        }),
      );
      assert.deepEqual(where, { id: { in: [] } });
    });
  });

  describe('canAccessEquipment', () => {
    const equipmentOnWarehouse: Equipment = {
      id: 'eq-1',
      inventoryNumber: 'INV-1',
      categoryId: 'cat-child',
      status: 'skladiste',
      warehouseId: 'wh-a',
      currentHolderId: null,
      entryDate: new Date(),
      specifications: {},
      warehouseCondition: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('admin can access any equipment', async () => {
      const service = createService();
      const allowed = await service.canAccessEquipment(
        authUser('admin'),
        equipmentOnWarehouse,
        null,
      );
      assert.equal(allowed, true);
    });

    it('evidenticar mode A can access warehouse stock in scope', async () => {
      const service = createService();
      const allowed = await service.canAccessEquipment(
        authUser('evidenticar'),
        equipmentOnWarehouse,
        null,
        [{ warehouseId: 'wh-a', categoryId: 'cat-root' }],
      );
      assert.equal(allowed, true);
    });

    it('evidenticar rejects equipment outside category tree', async () => {
      const service = createService();
      const allowed = await service.canAccessEquipment(
        authUser('evidenticar'),
        { ...equipmentOnWarehouse, categoryId: 'missing-cat' },
        null,
        [{ warehouseId: 'wh-a', categoryId: 'cat-root' }],
      );
      assert.equal(allowed, false);
    });

    it('evidenticar mode B accepts assigned holder in subtree', async () => {
      const service = createService();
      const holder: Employee = {
        id: 'emp-1',
        firstName: 'A',
        lastName: 'B',
        title: 'Radnik',
        orgUnitId: 'ou-child',
        email: null,
        phone: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const allowed = await service.canAccessEquipment(
        authUser('evidenticar'),
        {
          ...equipmentOnWarehouse,
          status: 'zaduzeno',
          warehouseId: null,
          currentHolderId: holder.id,
        },
        holder,
        [{ warehouseId: 'wh-a', categoryId: 'cat-root', orgUnitId: 'ou-root' }],
      );
      assert.equal(allowed, true);
    });
  });

  describe('canCreateTransferType', () => {
    it('admin can create any transfer type', async () => {
      const service = createService();
      assert.equal(await service.canCreateTransferType(authUser('admin'), 'zaduzenje'), true);
      assert.equal(await service.canCreateTransferType(authUser('admin'), 'prenos'), true);
    });

    it('evidenticar with any assignment can create zaduzenje type', async () => {
      const service = createService();
      assert.equal(
        await service.canCreateTransferType(authUser('evidenticar'), 'zaduzenje', [
          { warehouseId: 'wh-a', categoryId: 'cat-root', orgUnitId: 'ou-child' },
        ]),
        true,
      );
      assert.equal(
        await service.canCreateTransferType(authUser('evidenticar'), 'zaduzenje', [
          { warehouseId: 'wh-a', categoryId: 'cat-root' },
        ]),
        true,
      );
    });
  });

  describe('canCreateTransferForEquipment', () => {
    const zaduzenoEquipment: Equipment = {
      id: 'eq-z',
      inventoryNumber: 'INV-Z',
      categoryId: 'cat-child',
      status: 'zaduzeno',
      warehouseId: null,
      currentHolderId: 'emp-1',
      entryDate: new Date(),
      specifications: {},
      warehouseCondition: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const holder: Employee = {
      id: 'emp-1',
      firstName: 'A',
      lastName: 'B',
      title: 'Radnik',
      orgUnitId: 'ou-child',
      email: null,
      phone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('mode B allows razduzenje and prenos', async () => {
      const service = createService();
      const scopes = [{ warehouseId: 'wh-a', categoryId: 'cat-root', orgUnitId: 'ou-root' }];
      assert.equal(
        await service.canCreateTransferForEquipment(
          authUser('evidenticar'),
          zaduzenoEquipment,
          holder,
          'razduzenje',
          scopes,
        ),
        true,
      );
      assert.equal(
        await service.canCreateTransferForEquipment(
          authUser('evidenticar'),
          zaduzenoEquipment,
          holder,
          'prenos',
          scopes,
        ),
        true,
      );
    });

    it('mode A allows prenos for in-scope equipment', async () => {
      const service = createService();
      const scopes = [{ warehouseId: 'wh-a', categoryId: 'cat-root' }];
      assert.equal(
        await service.canCreateTransferForEquipment(
          authUser('evidenticar'),
          zaduzenoEquipment,
          holder,
          'prenos',
          scopes,
        ),
        true,
      );
    });

    it('mode B allows zaduzenje from custody pool only', async () => {
      const service = createService();
      const scopes = [{ warehouseId: 'wh-a', categoryId: 'cat-root', orgUnitId: 'ou-root' }];
      const poolEquipment: Equipment = {
        id: 'eq-pool',
        inventoryNumber: 'INV-POOL',
        categoryId: 'cat-child',
        status: 'skladiste',
        warehouseId: 'wh-a',
        custodyOrgUnitId: 'ou-child',
        currentHolderId: null,
        entryDate: new Date(),
        specifications: {},
        warehouseCondition: 'na_skladistu',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const plainSkladiste: Equipment = {
        ...poolEquipment,
        id: 'eq-plain',
        inventoryNumber: 'INV-PLAIN',
        custodyOrgUnitId: null,
      };
      assert.equal(
        await service.canCreateTransferForEquipment(
          authUser('evidenticar'),
          poolEquipment,
          null,
          'zaduzenje',
          scopes,
        ),
        true,
      );
      assert.equal(
        await service.canCreateTransferForEquipment(
          authUser('evidenticar'),
          plainSkladiste,
          null,
          'zaduzenje',
          scopes,
        ),
        false,
      );
    });
  });

  describe('buildTransferWhere', () => {
    it('admin has no transfer filter', async () => {
      const service = createService();
      const where = await service.buildTransferWhere(authUser('admin'));
      assert.deepEqual(where, {});
    });

    it('user transfer scope uses scoped equipment and employee ids', async () => {
      const service = createService({
        scopedEquipmentIds: ['eq-user'],
        scopedEmployeeIds: ['emp-user'],
      });
      const where = await service.buildTransferWhere(authUser('user'));
      assert.ok(where.OR);
      const orClauses = where.OR as Record<string, unknown>[];
      assert.ok(orClauses.some((row) => 'equipmentId' in row));
      assert.ok(orClauses.some((row) => 'fromPersonId' in row));
      assert.ok(orClauses.some((row) => 'toPersonId' in row));
    });

    it('central registrar excludes ED Zenica subtree holders', async () => {
      const service = createService();
      const holder: Employee = {
        id: 'emp-ed',
        firstName: 'E',
        lastName: 'D',
        title: 'Radnik',
        orgUnitId: 'sluzba-ed',
        email: null,
        phone: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const allowed = await service.canAccessEquipment(
        authUser('evidenticar'),
        {
          id: 'eq-ed',
          inventoryNumber: 'INV-ED',
          categoryId: 'cat-child',
          status: 'zaduzeno',
          warehouseId: null,
          currentHolderId: holder.id,
          entryDate: new Date(),
          specifications: {},
          warehouseCondition: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        holder,
        [{ warehouseId: 'wh-central', categoryId: 'cat-root' }],
      );
      assert.equal(allowed, false);
    });

    it('ED registrar includes ED Zenica subtree holders', async () => {
      const service = createService();
      const holder: Employee = {
        id: 'emp-ed',
        firstName: 'E',
        lastName: 'D',
        title: 'Radnik',
        orgUnitId: 'sluzba-ed',
        email: null,
        phone: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const allowed = await service.canAccessEquipment(
        authUser('evidenticar'),
        {
          id: 'eq-ed',
          inventoryNumber: 'INV-ED',
          categoryId: 'cat-child',
          status: 'zaduzeno',
          warehouseId: null,
          currentHolderId: holder.id,
          entryDate: new Date(),
          specifications: {},
          warehouseCondition: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        holder,
        [{ warehouseId: 'wh-ed', categoryId: 'cat-root' }],
      );
      assert.equal(allowed, true);
    });

    it('evidenticar transfer scope includes employee participants', async () => {
      const service = createService({
        scopedEquipmentIds: ['eq-a'],
        scopedEmployeeIds: ['emp-a', 'emp-b'],
      });
      const where = await service.buildTransferWhere(
        authUser('evidenticar', {
          registrarScopes: [{ warehouseId: 'wh-a', categoryId: 'cat-root' }],
        }),
      );
      assert.ok(where.OR);
      const orClauses = where.OR as Record<string, unknown>[];
      assert.ok(orClauses.some((row) => 'fromPersonId' in row));
      assert.ok(orClauses.some((row) => 'toPersonId' in row));
      assert.ok(orClauses.some((row) => 'equipmentId' in row));
    });

    it('evidenticar multi-assignment A+B transfer scope unions equipment and employee ids', async () => {
      const service = createService({
        scopedEquipmentIds: ['eq-mode-a', 'eq-mode-b-w1', 'eq-mode-b-w2'],
        scopedEmployeeIds: ['emp-a', 'emp-b1', 'emp-b2'],
      });
      const where = await service.buildTransferWhere(
        authUser('evidenticar', {
          registrarScopes: [
            { warehouseId: 'wh-a', categoryId: 'cat-root' },
            { warehouseId: 'wh-a', categoryId: 'cat-child', orgUnitId: 'ou-child' },
            { warehouseId: 'wh-b', categoryId: 'cat-root', orgUnitId: 'ou-other' },
          ],
        }),
      );
      assert.ok(where.OR);
      const orClauses = where.OR as Array<Record<string, unknown>>;
      const equipmentClause = orClauses.find((row) => 'equipmentId' in row) as {
        equipmentId: { in: string[] };
      };
      assert.ok(equipmentClause);
      assert.deepEqual(equipmentClause.equipmentId.in, [
        'eq-mode-a',
        'eq-mode-b-w1',
        'eq-mode-b-w2',
      ]);
      const fromClause = orClauses.find((row) => 'fromPersonId' in row) as {
        fromPersonId: { in: string[] };
      };
      assert.ok(fromClause?.fromPersonId.in.includes('emp-b2'));
    });

    it('evidenticar without scoped ids returns empty transfer filter', async () => {
      const service = createService();
      const where = await service.buildTransferWhere(authUser('evidenticar'));
      assert.deepEqual(where, { id: { in: [] } });
    });

    it('evidenticar can access own employee record outside registrar scope', async () => {
      const service = createService();
      const self: Employee = {
        id: 'emp-self',
        firstName: 'Self',
        lastName: 'Registrar',
        title: 'Evidentičar',
        orgUnitId: 'sluzba-ed',
        email: null,
        phone: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const allowed = await service.canAccessEmployee(
        authUser('evidenticar', {
          employeeId: self.id,
          registrarScopes: [{ warehouseId: 'wh-central', categoryId: 'cat-root' }],
        }),
        self,
      );
      assert.equal(allowed, true);
    });

    it('assertCanAccessEmployee throws when employee is outside scope', async () => {
      const service = createService();
      const employee: Employee = {
        id: 'emp-out',
        firstName: 'Out',
        lastName: 'Scope',
        title: 'Radnik',
        orgUnitId: 'ou-other',
        email: null,
        phone: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await assert.rejects(
        () =>
          service.assertCanAccessEmployee(
            authUser('evidenticar', {
              registrarScopes: [{ warehouseId: 'wh-a', categoryId: 'cat-root' }],
            }),
            employee,
          ),
        (err: unknown) => err instanceof ForbiddenException,
      );
    });

    it('evidenticar can access own held equipment outside registrar scope', async () => {
      const service = createService();
      const selfId = 'emp-self';
      const allowed = await service.canAccessEquipment(
        authUser('evidenticar', {
          employeeId: selfId,
          registrarScopes: [{ warehouseId: 'wh-central', categoryId: 'cat-root' }],
        }),
        {
          id: 'eq-self',
          inventoryNumber: 'INV-SELF',
          categoryId: 'cat-other',
          status: 'zaduzeno',
          warehouseId: null,
          currentHolderId: selfId,
          entryDate: new Date(),
          specifications: {},
          warehouseCondition: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: selfId,
          firstName: 'Self',
          lastName: 'Registrar',
          title: 'Evidentičar',
          orgUnitId: 'sluzba-ed',
          email: null,
          phone: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      );
      assert.equal(allowed, true);
    });

    it('evidenticar equipment where includes own held items', async () => {
      const service = createService();
      const where = await service.buildEquipmentWhere(
        authUser('evidenticar', {
          employeeId: 'emp-self',
          registrarScopes: [{ warehouseId: 'wh-central', categoryId: 'cat-root' }],
        }),
      );
      assert.ok(where.OR);
      const orClauses = where.OR as Record<string, unknown>[];
      assert.ok(orClauses.some((row) => 'currentHolderId' in row));
    });

  });

  describe('canAccessTransfer', () => {
    const zaduzenoEquipment: Equipment = {
      id: 'eq-cross',
      inventoryNumber: 'INV-CROSS',
      categoryId: 'cat-child',
      status: 'zaduzeno',
      warehouseId: null,
      currentHolderId: 'emp-b',
      entryDate: new Date(),
      specifications: {},
      warehouseCondition: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const holderB: Employee = {
      id: 'emp-b',
      firstName: 'B',
      lastName: 'Worker',
      title: 'Radnik',
      orgUnitId: 'ou-other',
      email: null,
      phone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('allows transfer when toPerson is in registrar employee scope', async () => {
      const service = createService();
      const allowed = await service.canAccessTransfer(
        authUser('evidenticar', {
          registrarScopes: [{ warehouseId: 'wh-b', categoryId: 'cat-root' }],
        }),
        {
          fromPerson: null,
          toPerson: holderB,
          equipment: zaduzenoEquipment,
          holder: holderB,
        },
      );
      assert.equal(allowed, true);
    });

    it('denies transfer when toPerson is outside all assignment scopes', async () => {
      const service = createService();
      const allowed = await service.canAccessTransfer(
        authUser('evidenticar', {
          registrarScopes: [{ warehouseId: 'wh-a', categoryId: 'cat-root' }],
        }),
        {
          fromPerson: null,
          toPerson: holderB,
          equipment: zaduzenoEquipment,
          holder: holderB,
        },
      );
      assert.equal(allowed, false);
    });
  });
});
