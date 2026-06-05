import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Equipment, Employee, UserRole } from '../../../generated/prisma/client';
import { RegistrarScopeService } from './registrar-scope.service';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
import type { RegistrarScopeAssignment } from '../types/registrar-scope.type';

const categories = [
  { id: 'cat-root', parentId: null },
  { id: 'cat-child', parentId: 'cat-root' },
];

const orgUnits = [
  { id: 'ou-root', parentId: null, effectiveLocationCityId: 'city-a', locationCityId: null },
  { id: 'ou-child', parentId: 'ou-root', effectiveLocationCityId: 'city-a', locationCityId: null },
  { id: 'ou-other', parentId: null, effectiveLocationCityId: 'city-b', locationCityId: null },
];

const warehouses: Record<
  string,
  { id: string; cityId: string; orgUnitId: string | null }
> = {
  'wh-a': { id: 'wh-a', cityId: 'city-a', orgUnitId: 'ou-root' },
  'wh-b': { id: 'wh-b', cityId: 'city-b', orgUnitId: 'ou-other' },
};

const expandOrgSubtree = (rootId: string): string[] => {
  const result = new Set<string>();
  const visit = (id: string): void => {
    if (result.has(id)) {
      return;
    }
    result.add(id);
    for (const unit of orgUnits.filter((row) => row.parentId === id)) {
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
  ...overrides,
});

const createService = (options?: {
  keeperWarehouseIds?: string[];
  actorEmployeeId?: string | null;
}) => {
  const prisma = {
    category: {
      findMany: async () => categories,
    },
    warehouse: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        warehouses[where.id] ?? null,
    },
    warehouseKeeper: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        (options?.keeperWarehouseIds ?? []).map((warehouseId) => ({
          warehouseId,
          userId: where.userId,
        })),
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
      const statusFilter = andClause[1] as { status: { not: string } };
      assert.equal(statusFilter.status.not, 'skladiste');
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

    it('evidenticar mode A filters by warehouse city coverage', async () => {
      const service = createService();
      const where = await service.buildEmployeeWhere(
        authUser('evidenticar', {
          registrarScopes: [{ warehouseId: 'wh-a', categoryId: 'cat-root' }],
        }),
      );
      assert.ok(where.AND);
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

    it('evidenticar needs mode A assignment for zaduzenje', async () => {
      const service = createService();
      assert.equal(
        await service.canCreateTransferType(authUser('evidenticar'), 'zaduzenje', [
          { warehouseId: 'wh-a', categoryId: 'cat-root', orgUnitId: 'ou-child' },
        ]),
        false,
      );
      assert.equal(
        await service.canCreateTransferType(authUser('evidenticar'), 'zaduzenje', [
          { warehouseId: 'wh-a', categoryId: 'cat-root' },
        ]),
        true,
      );
    });
  });

  describe('buildTransferWhere', () => {
    it('admin has no transfer filter', async () => {
      const service = createService();
      const where = await service.buildTransferWhere(authUser('admin'));
      assert.deepEqual(where, {});
    });

    it('user transfer scope follows equipment scope', async () => {
      const service = createService();
      const where = await service.buildTransferWhere(authUser('user'));
      assert.deepEqual(where, {
        equipment: { currentHolderId: 'emp-user' },
      });
    });
  });
});
