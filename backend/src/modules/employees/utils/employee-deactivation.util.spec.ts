import { BadRequestException } from '@nestjs/common';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EMPLOYEE_MESSAGES } from '../../../common/utils/employee-messages.util';
import {
  assertEmployeeCanDeactivateOrNotify,
  resolveDeactivationNotificationRecipients,
} from './employee-deactivation.util';

describe('employee-deactivation.util', () => {
  it('resolveDeactivationNotificationRecipients returns registrars for warehouse+category', async () => {
    const prisma = {
      registrarAssignment: {
        findMany: async () => [{ userId: 'reg-1', categoryId: 'cat-root' }],
      },
      user: {
        findMany: async () => [{ id: 'admin-1' }],
      },
    };
    const registrarScope = {
      expandCategoryIds: async (ids: string[]) => new Set(ids),
    };
    const warehouseResolution = {
      resolveForEmployee: async () => 'wh-1',
    };
    const actual = await resolveDeactivationNotificationRecipients(
      { prisma: prisma as never, registrarScope: registrarScope as never, warehouseResolution: warehouseResolution as never },
      'emp-1',
      [{ id: 'eq-1', categoryId: 'cat-root', inventoryNumber: 'INV-1', category: { name: 'Laptop' } }],
    );
    assert.deepEqual(actual, ['reg-1']);
  });

  it('resolveDeactivationNotificationRecipients falls back to admins without warehouse', async () => {
    const prisma = {
      user: {
        findMany: async () => [{ id: 'admin-1' }],
      },
    };
    const registrarScope = { expandCategoryIds: async (ids: string[]) => new Set(ids) };
    const warehouseResolution = { resolveForEmployee: async () => null };
    const actual = await resolveDeactivationNotificationRecipients(
      { prisma: prisma as never, registrarScope: registrarScope as never, warehouseResolution: warehouseResolution as never },
      'emp-1',
      [{ id: 'eq-1', categoryId: 'cat-root', inventoryNumber: 'INV-1', category: { name: 'Laptop' } }],
    );
    assert.deepEqual(actual, ['admin-1']);
  });

  it('assertEmployeeCanDeactivateOrNotify throws and notifies when equipment is held', async () => {
    let notified = false;
    const deps = {
      prisma: {
        equipment: {
          findMany: async () => [
            { id: 'eq-1', categoryId: 'cat-1', inventoryNumber: 'INV-1', category: { name: 'Laptop' } },
          ],
        },
        registrarAssignment: {
          findMany: async () => [{ userId: 'reg-1', categoryId: 'cat-1' }],
        },
        user: { findMany: async () => [] },
      },
      registrarScope: { expandCategoryIds: async (ids: string[]) => new Set(ids) },
      warehouseResolution: { resolveForEmployee: async () => 'wh-1' },
      notifications: {
        notifyEmployeeDeactivationEquipmentRequired: async () => {
          notified = true;
        },
      },
    };
    await assert.rejects(
      () =>
        assertEmployeeCanDeactivateOrNotify(
          deps as never,
          'emp-1',
          'John Doe',
        ),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.equal(err.message, EMPLOYEE_MESSAGES.deactivateHasHeldEquipment);
        return true;
      },
    );
    assert.equal(notified, true);
  });

  it('assertEmployeeCanDeactivateOrNotify passes when no held equipment', async () => {
    const deps = {
      prisma: {
        equipment: { findMany: async () => [] },
      },
      registrarScope: { expandCategoryIds: async (ids: string[]) => new Set(ids) },
      warehouseResolution: { resolveForEmployee: async () => 'wh-1' },
      notifications: {
        notifyEmployeeDeactivationEquipmentRequired: async () => {
          throw new Error('should not notify');
        },
      },
    };
    await assertEmployeeCanDeactivateOrNotify(deps as never, 'emp-1', 'John Doe');
  });
});
