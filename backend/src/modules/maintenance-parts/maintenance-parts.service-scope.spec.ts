import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { MaintenancePartsService } from './maintenance-parts.service';

const registrarUser: AuthenticatedUser = {
  id: 'registrar-1',
  username: 'registrar',
  role: 'evidenticar',
  employeeId: null,
  registrarScopes: [{ warehouseId: 'warehouse-1', categoryId: 'category-root' }],
  coordinatorAssignments: [],
  moderatorOrgRoots: [],
  moderatorWarehouseIds: [],
};

const lotScopeWhere = {
  warehouseId: 'warehouse-1',
  categoryId: { in: ['category-root', 'category-leaf'] },
};

const createService = () => {
  const lotQueries: { where: unknown }[] = [];
  const lot = { id: 'maintenance-lot-1' };
  const prisma = {
    warehouseStockLot: {
      findMany: async (query: { where: unknown }) => {
        lotQueries.push(query);
        return [lot];
      },
    },
    equipment: {
      findUnique: async () => ({
        id: 'equipment-1',
        categoryId: 'host-category',
        currentHolderId: null,
        status: 'skladiste',
        category: { categoryKind: 'ASSET' },
      }),
    },
    categoryMaintenanceLink: {
      findMany: async () => [{ maintenanceCategoryId: 'maintenance-category' }],
    },
    category: {
      findMany: async () => [
        { id: 'maintenance-category', parentId: null, categoryKind: 'MAINTENANCE' },
      ],
    },
  };
  const registrarScope = {
    buildStockLotWhere: async () => lotScopeWhere,
    assertCanAccessEquipment: async () => undefined,
    canAccessStockLot: async () => {
      throw new Error('per-lot scope check should not be called');
    },
  };
  const service = new MaintenancePartsService(
    prisma as never,
    { assertFeatureEnabled: async () => undefined } as never,
    {} as never,
    registrarScope as never,
    {} as never,
    {} as never,
    { isModerator: () => false } as never,
  );
  return { service, lotQueries, lot };
};

describe('MaintenancePartsService registrar lot scope', () => {
  it('pushes maintenance stock-lot scope into the warehouse query', async () => {
    const { service, lotQueries, lot } = createService();

    const result = await service.listMaintenanceLots(registrarUser, 'warehouse-1');

    assert.deepEqual(result, [lot]);
    assert.deepEqual(lotQueries, [
      {
        where: {
          AND: [
            { warehouseId: 'warehouse-1', lotKind: 'MAINTENANCE' },
            lotScopeWhere,
          ],
        },
        include: { category: true },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
      },
    ]);
  });

  it('pushes registrar scope into available maintenance-lot query', async () => {
    const { service, lotQueries, lot } = createService();

    const result = await service.listAvailableLotsForHost(
      registrarUser,
      'equipment-1',
      'maintenance-category',
    );

    assert.deepEqual(result, [lot]);
    assert.deepEqual(lotQueries, [
      {
        where: {
          AND: [
            {
              lotKind: 'MAINTENANCE',
              categoryId: 'maintenance-category',
              quantityOnHand: { gt: 0 },
              status: 'spremno_za_izdavanje',
            },
            lotScopeWhere,
          ],
        },
        include: { warehouse: true, category: true },
        orderBy: [{ productName: 'asc' }, { entryDate: 'desc' }],
      },
    ]);
  });
});
