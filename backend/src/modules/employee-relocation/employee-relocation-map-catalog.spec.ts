import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { EmployeeRelocationService } from './employee-relocation.service';

const adminUser: AuthenticatedUser = {
  id: 'admin-1',
  username: 'admin',
  role: 'admin',
  employeeId: null,
  registrarScopes: [],
  coordinatorAssignments: [],
  moderatorOrgRoots: [],
  moderatorWarehouseIds: [],
};

const registrarUser: AuthenticatedUser = {
  id: 'reg-1',
  username: 'reg',
  role: 'evidenticar',
  employeeId: 'emp-1',
  registrarScopes: [],
  coordinatorAssignments: [],
  moderatorOrgRoots: [],
  moderatorWarehouseIds: [],
};

const baseLine = {
  id: 'line-1',
  caseId: 'case-1',
  equipmentId: 'equip-1',
  categoryId: 'cat-leaf',
  status: 'pending_source' as const,
  case: { id: 'case-1', status: 'open' as const },
  equipment: {
    id: 'equip-1',
    inventoryNumber: 'INV-1',
    catalogItemId: null,
    stockLotId: null,
    stockLot: null,
    catalogItem: null,
  },
};

const createService = (options: {
  line?: typeof baseLine;
  catalogItem?: { id: string; categoryId: string; isActive: boolean } | null;
  leafError?: Error;
}) => {
  let updatedCatalogId: string | null = null;
  let recordedAction: string | null = null;

  const prisma = {
    employeeRelocationLine: {
      findUnique: async () => options.line ?? baseLine,
    },
    equipmentCatalogItem: {
      findUnique: async () => options.catalogItem ?? null,
    },
    $transaction: async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        equipment: {
          update: async ({ data }: { data: { catalogItemId: string } }) => {
            updatedCatalogId = data.catalogItemId;
          },
        },
        employeeRelocationEvent: {
          create: async ({ data }: { data: { action: string } }) => {
            recordedAction = data.action;
          },
        },
        user: {
          findFirst: async () => null,
        },
      };
      await fn(tx);
    },
  };

  const categoriesService = {
    assertLeafCategory: async () => {
      if (options.leafError) {
        throw options.leafError;
      }
      return { id: 'cat-leaf' };
    },
  };

  const settingsService = {
    assertFeatureEnabled: async () => undefined,
  };

  const moderatorScope = {
    isModerator: () => false,
    assertEmployeeInScope: async () => undefined,
    resolveModeratorOrgUnitIds: async () => null as string[] | null,
    assertLineInModeratorScope: async () => undefined,
  };

  const service = new EmployeeRelocationService(
    prisma as never,
    {} as never,
    {} as never,
    moderatorScope as never,
    {} as never,
    {} as never,
    {} as never,
    settingsService as never,
    categoriesService as never,
  );

  return { service, getUpdatedCatalogId: () => updatedCatalogId, getRecordedAction: () => recordedAction };
};

describe('EmployeeRelocationService.mapLineCatalog', () => {
  it('maps catalog for admin when category matches', async () => {
    const { service, getUpdatedCatalogId, getRecordedAction } = createService({
      catalogItem: { id: 'catalog-1', categoryId: 'cat-leaf', isActive: true },
    });
    await service.mapLineCatalog(adminUser, 'line-1', { catalogItemId: 'catalog-1' });
    assert.equal(getUpdatedCatalogId(), 'catalog-1');
    assert.equal(getRecordedAction(), 'catalog_mapped');
  });

  it('rejects non-admin', async () => {
    const { service } = createService({
      catalogItem: { id: 'catalog-1', categoryId: 'cat-leaf', isActive: true },
    });
    await assert.rejects(
      () => service.mapLineCatalog(registrarUser, 'line-1', { catalogItemId: 'catalog-1' }),
      ForbiddenException,
    );
  });

  it('rejects catalog from different category', async () => {
    const { service } = createService({
      catalogItem: { id: 'catalog-1', categoryId: 'other-cat', isActive: true },
    });
    await assert.rejects(
      () => service.mapLineCatalog(adminUser, 'line-1', { catalogItemId: 'catalog-1' }),
      BadRequestException,
    );
  });

  it('rejects missing catalog item', async () => {
    const { service } = createService({ catalogItem: null });
    await assert.rejects(
      () => service.mapLineCatalog(adminUser, 'line-1', { catalogItemId: 'missing' }),
      NotFoundException,
    );
  });

  it('rejects when line is not on source queue', async () => {
    const { service } = createService({
      line: { ...baseLine, status: 'pending_dest' },
      catalogItem: { id: 'catalog-1', categoryId: 'cat-leaf', isActive: true },
    });
    await assert.rejects(
      () => service.mapLineCatalog(adminUser, 'line-1', { catalogItemId: 'catalog-1' }),
      BadRequestException,
    );
  });
});
