import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import type { RegistrarScopeAssignment } from '../../common/types/registrar-scope.type';
import { assertRegistrarScopesValid } from './registrar-assignment-validation.util';

const categories = [
  { id: 'cat-1', name: 'Računarska', parentId: null, categoryKind: 'ASSET' as const },
  { id: 'cat-2', name: 'Namještaj', parentId: null, categoryKind: 'ASSET' as const },
  { id: 'cat-1-child', name: 'Laptop', parentId: 'cat-1', categoryKind: 'ASSET' as const },
];

const orgUnits = [
  { id: 'ou-root', name: 'Direkcija', parentId: null },
  { id: 'ou-sluzba', name: 'Služba', parentId: 'ou-root' },
  { id: 'ou-other', name: 'Područje', parentId: null },
];

const warehouses = [
  {
    id: 'wh-1',
    name: 'Skladište 1',
    orgUnitId: 'ou-root',
    cityId: 'city-1',
    isActive: true,
    createdAt: new Date('2024-01-01'),
  },
  {
    id: 'wh-2',
    name: 'Skladište 2',
    orgUnitId: 'ou-other',
    cityId: 'city-2',
    isActive: true,
    createdAt: new Date('2024-01-02'),
  },
];

const equipmentRows = [
  { warehouseId: 'wh-1', categoryId: 'cat-1-child' },
  { warehouseId: 'wh-1', categoryId: 'cat-2' },
  { warehouseId: 'wh-2', categoryId: 'cat-1-child' },
];

const lotRows = [{ warehouseId: 'wh-2', categoryId: 'cat-1-child' }];

const createPrisma = () =>
  ({
    category: { findMany: async () => categories },
    warehouse: { findMany: async () => warehouses },
    orgUnit: { findMany: async () => orgUnits },
    equipment: {
      findMany: async () => equipmentRows,
    },
    warehouseStockLot: { findMany: async () => lotRows },
  }) as never;

describe('assertRegistrarScopesValid', () => {
  it('accepts mode A plus mode B on different categories in same warehouse', async () => {
    const scopes: RegistrarScopeAssignment[] = [
      { warehouseId: 'wh-1', categoryId: 'cat-1' },
      { warehouseId: 'wh-1', categoryId: 'cat-2', orgUnitId: 'ou-sluzba' },
    ];
    await assertRegistrarScopesValid(createPrisma(), scopes);
  });

  it('accepts mode B on second warehouse with same category', async () => {
    const scopes: RegistrarScopeAssignment[] = [
      { warehouseId: 'wh-1', categoryId: 'cat-1' },
      { warehouseId: 'wh-2', categoryId: 'cat-1', orgUnitId: 'ou-other' },
    ];
    await assertRegistrarScopesValid(createPrisma(), scopes);
  });

  it('rejects mixing mode A and B for same warehouse and category', async () => {
    const scopes: RegistrarScopeAssignment[] = [
      { warehouseId: 'wh-1', categoryId: 'cat-1' },
      { warehouseId: 'wh-1', categoryId: 'cat-1', orgUnitId: 'ou-sluzba' },
    ];
    await assert.rejects(
      () => assertRegistrarScopesValid(createPrisma(), scopes),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.match(error.message, /Režim A i Režim B/);
        return true;
      },
    );
  });

  it('rejects org unit whose effective warehouse differs', async () => {
    const scopes: RegistrarScopeAssignment[] = [
      { warehouseId: 'wh-1', categoryId: 'cat-2', orgUnitId: 'ou-other' },
    ];
    await assert.rejects(
      () => assertRegistrarScopesValid(createPrisma(), scopes),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.match(error.message, /pripada skladištu/);
        return true;
      },
    );
  });

  it('rejects duplicate rows', async () => {
    const scopes: RegistrarScopeAssignment[] = [
      { warehouseId: 'wh-1', categoryId: 'cat-2', orgUnitId: 'ou-sluzba' },
      { warehouseId: 'wh-1', categoryId: 'cat-2', orgUnitId: 'ou-sluzba' },
    ];
    await assert.rejects(
      () => assertRegistrarScopesValid(createPrisma(), scopes),
      (error: unknown) => error instanceof BadRequestException,
    );
  });
});
