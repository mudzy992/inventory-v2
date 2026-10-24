import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { Employee } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { EmployeesService } from './employees.service';

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

const baseEmployee: Employee = {
  id: 'emp-1',
  firstName: 'Ana',
  lastName: 'Anić',
  title: 'Referent',
  orgUnitId: 'ou-child',
  staffNumber: null,
  gender: 'female',
  isActive: true,
  email: null,
  phone: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const createService = (options?: {
  canAccessEmployee?: boolean;
  featureEnabled?: boolean;
}) => {
  const prisma = {
    employee: {
      findUnique: async () => baseEmployee,
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'emp-new',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        ...baseEmployee,
        ...data,
      }),
    },
    orgUnit: {
      findUnique: async () => ({ id: 'ou-child' }),
    },
    user: {
      findFirst: async () => null,
    },
    $transaction: async (fn: (tx: unknown) => Promise<Employee>) => {
      const tx = {
        employee: {
          update: async ({ data }: { data: Record<string, unknown> }) => ({
            ...baseEmployee,
            ...data,
          }),
        },
        user: {
          update: async () => ({}),
        },
      };
      return fn(tx);
    },
  };

  const registrarScope = {
    assertCanAccessEmployee: async () => {
      if (options?.canAccessEmployee === false) {
        throw new ForbiddenException('Employee outside your scope');
      }
    },
    canAccessEmployee: async () => options?.canAccessEmployee !== false,
    buildEmployeeWhere: async () => ({}),
  };

  const settingsService = {
    assertFeatureEnabled: async (key: string) => {
      if (key === 'features.evidenticar_employee_ops' && options?.featureEnabled === false) {
        throw new ForbiddenException('disabled');
      }
    },
    getBooleanValue: async () => true,
  };

  return new EmployeesService(
    prisma as never,
    registrarScope as never,
    { isModerator: () => false, assertOrgUnitInScope: async () => undefined } as never,
    {} as never,
    settingsService as never,
    { handleOrgUnitChange: async () => undefined } as never,
    { disconnectUserSockets: () => undefined } as never,
    { del: async () => undefined } as never,
  );
};

describe('EmployeesService registrar writes', () => {
  it('rejects create when employee org unit is outside registrar scope', async () => {
    const service = createService({ canAccessEmployee: false });
    await assert.rejects(
      () =>
        service.create(registrarUser, {
          firstName: 'Novi',
          lastName: 'Radnik',
          title: 'Referent',
          orgUnitId: 'ou-other',
        }),
      (err: unknown) => err instanceof ForbiddenException,
    );
  });

  it('allows create when employee org unit is in registrar scope', async () => {
    const service = createService({ canAccessEmployee: true });
    const created = await service.create(registrarUser, {
      firstName: 'Novi',
      lastName: 'Radnik',
      title: 'Referent',
      orgUnitId: 'ou-child',
    });
    assert.equal(created.firstName, 'Novi');
  });

  it('rejects update when existing employee is outside registrar scope', async () => {
    const service = createService({ canAccessEmployee: false });
    await assert.rejects(
      () =>
        service.update(registrarUser, 'emp-1', {
          firstName: 'Izmijenjeno',
        }),
      (err: unknown) => err instanceof ForbiddenException,
    );
  });

  it('rejects registrar writes when feature flag is disabled', async () => {
    const service = createService({ featureEnabled: false });
    await assert.rejects(
      () =>
        service.create(registrarUser, {
          firstName: 'Novi',
          lastName: 'Radnik',
          title: 'Referent',
          orgUnitId: 'ou-child',
        }),
      (err: unknown) => err instanceof ForbiddenException,
    );
  });
});
