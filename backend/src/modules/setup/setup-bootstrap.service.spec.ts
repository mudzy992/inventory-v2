import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import type { InitializeSetupDto } from './dto/initialize-setup.dto';
import { SetupBootstrapService } from './setup-bootstrap.service';

const buildDto = (): InitializeSetupDto => ({
  company: {
    name: 'Test d.o.o.',
    address: 'Ulica 1',
    city: 'Sarajevo',
  },
  location: {
    cantonName: 'Kanton Sarajevo',
    cities: ['Sarajevo'],
  },
  organization: {},
  warehouse: {
    name: 'Glavno skladište',
    address: 'Ulica 1',
  },
  category: {
    parentName: 'Oprema',
    leafName: 'Opšta oprema',
  },
  catalog: {
    name: 'Opšta stavka',
    code: 'OP-001',
  },
  admin: {
    firstName: 'Admin',
    lastName: 'Korisnik',
    username: 'admin',
    password: 'password123',
  },
  roles: {
    evidenticar: {
      employee: { firstName: 'Evi', lastName: 'Denticar', title: 'Evidentičar' },
      username: 'evidenticar',
      password: 'password123',
    },
    skladistar: {
      employee: { firstName: 'Skla', lastName: 'Distar', title: 'Skladištar' },
      username: 'skladistar',
      password: 'password123',
    },
    popis_koordinator: {
      employee: { firstName: 'Popis', lastName: 'Koordinator', title: 'Koordinator' },
      username: 'koordinator',
      password: 'password123',
    },
    user: {
      employee: { firstName: 'Obicni', lastName: 'Korisnik', title: 'Referent' },
      username: 'korisnik',
      password: 'password123',
    },
  },
  director: {
    firstName: 'Admin',
    lastName: 'Korisnik',
    title: 'Direktor',
  },
});

describe('SetupBootstrapService', () => {
  const createService = () => {
    const tx = {
      user: { count: async () => 0, create: async () => ({ id: 'user' }) },
      canton: { create: async () => ({ id: 'canton-1' }) },
      city: { create: async () => ({ id: 'city-1' }) },
      orgUnit: {
        create: async () => ({ id: 'org-direkcija' }),
        update: async () => ({}),
        findMany: async () => [{ id: 'org-direkcija', parentId: null, signerId: 'emp-director' }],
      },
      employee: {
        create: async () => {
          const ids = ['emp-director', 'emp-user', 'emp-skladistar', 'emp-evidenticar', 'emp-coordinator'];
          return { id: ids.shift() ?? 'emp-x' };
        },
      },
      category: {
        create: async () => {
          const ids = ['cat-parent', 'cat-leaf'];
          return { id: ids.shift() ?? 'cat-x' };
        },
      },
      equipmentCatalogItem: { create: async () => ({ id: 'catalog-1' }) },
      warehouse: { create: async () => ({ id: 'wh-1' }) },
      warehouseKeeper: { create: async () => ({}) },
      registrarAssignment: { create: async () => ({}) },
      inventoryCoordinatorAssignment: { create: async () => ({}) },
    };
    let userCreateCount = 0;
    tx.user.create = async () => {
      userCreateCount += 1;
      const ids = ['user-admin', 'user-evidenticar', 'user-skladistar', 'user-coordinator', 'user-user'];
      return { id: ids[userCreateCount - 1] ?? 'user-x' };
    };
    const prisma = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    };
    return { service: new SetupBootstrapService(prisma as never), tx, getUserCreateCount: () => userCreateCount };
  };

  it('rejects duplicate usernames', async () => {
    const { service } = createService();
    const dto = buildDto();
    dto.roles.user.username = 'admin';
    await assert.rejects(() => service.bootstrap(dto), BadRequestException);
  });

  it('creates bootstrap entities in transaction', async () => {
    const { service, getUserCreateCount } = createService();
    const actual = await service.bootstrap(buildDto());
    assert.equal(getUserCreateCount(), 5);
    assert.equal(actual.usernames.length, 5);
    assert.equal(actual.warehouseId, 'wh-1');
  });

  it('builds settings with Evidens app name', () => {
    const { service } = createService();
    const entries = service.buildCompanySettingsEntries(buildDto());
    assert.equal(entries.find((e) => e.key === 'app.name')?.value, 'Evidens');
    assert.equal(entries.find((e) => e.key === 'company.name')?.value, 'Test d.o.o.');
  });
});
