import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { EmployeeRelocationService } from './employee-relocation.service';

const registrarUser: AuthenticatedUser = {
  id: 'reg-1',
  username: 'registrar',
  role: 'evidenticar',
  employeeId: null,
  registrarScopes: [{ warehouseId: 'wh-a', categoryId: 'cat-root' }],
  coordinatorAssignments: [],
  moderatorOrgRoots: [],
  moderatorWarehouseIds: [],
};

const createService = (options?: { canAccessEmployee?: boolean }) => {
  const prisma = {
    employee: {
      findUnique: async () => ({
        id: 'emp-1',
        firstName: 'Ana',
        lastName: 'Anić',
        orgUnitId: 'ou-child',
      }),
    },
    equipment: {
      findMany: async () => [],
    },
  };

  const registrarScope = {
    assertCanAccessEmployee: async () => {
      if (options?.canAccessEmployee === false) {
        throw new ForbiddenException('Employee outside your scope');
      }
    },
    expandCategoryIds: async () => new Set<string>(),
  };

  const settingsService = {
    assertFeatureEnabled: async () => undefined,
    getBooleanValue: async () => true,
  };

  return new EmployeeRelocationService(
    prisma as never,
    {
      resolveForOrgUnit: async () => 'wh-a',
    } as never,
    registrarScope as never,
    { isModerator: () => false, assertEmployeeInScope: async () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    settingsService as never,
    {} as never,
  );
};

describe('EmployeeRelocationService preview for registrar', () => {
  it('allows preview when employee is in registrar scope', async () => {
    const service = createService({ canAccessEmployee: true });
    const preview = await service.preview(registrarUser, {
      employeeId: 'emp-1',
      newOrgUnitId: 'ou-other',
    });
    assert.equal(preview.employeeId, 'emp-1');
    assert.equal(preview.sameWarehouse, true);
  });

  it('rejects preview when employee is outside registrar scope', async () => {
    const service = createService({ canAccessEmployee: false });
    await assert.rejects(
      () =>
        service.preview(registrarUser, {
          employeeId: 'emp-1',
          newOrgUnitId: 'ou-other',
        }),
      (err: unknown) => err instanceof ForbiddenException,
    );
  });
});
