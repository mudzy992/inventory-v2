import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';

/** Mirrors evidentičar branch in WarehousesService.buildListWhere */
const buildEvidenticarWarehouseScope = (
  user: AuthenticatedUser,
): { id: { in: string[] } } => {
  const warehouseIds = [...new Set(user.registrarScopes.map((row) => row.warehouseId))];
  return warehouseIds.length > 0 ? { id: { in: warehouseIds } } : { id: { in: [] } };
};

describe('warehouses list evidenticar scope', () => {
  it('restricts list to assigned warehouse ids', () => {
    const user: AuthenticatedUser = {
      id: 'ev-1',
      username: 'evidenticar',
      role: 'evidenticar',
      employeeId: 'emp-1',
      registrarScopes: [
        { warehouseId: 'wh-a', categoryId: 'cat-1' },
        { warehouseId: 'wh-b', categoryId: 'cat-2' },
        { warehouseId: 'wh-a', categoryId: 'cat-3' },
      ],
      coordinatorAssignments: [],
      moderatorOrgRoots: [],
      moderatorWarehouseIds: [],
    };
    assert.deepEqual(buildEvidenticarWarehouseScope(user), {
      id: { in: ['wh-a', 'wh-b'] },
    });
  });

  it('returns empty scope when no assignments', () => {
    const user: AuthenticatedUser = {
      id: 'ev-2',
      username: 'evidenticar',
      role: 'evidenticar',
      employeeId: null,
      registrarScopes: [],
      coordinatorAssignments: [],
      moderatorOrgRoots: [],
      moderatorWarehouseIds: [],
    };
    assert.deepEqual(buildEvidenticarWarehouseScope(user), { id: { in: [] } });
  });
});
