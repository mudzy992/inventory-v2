import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  assertPrenosWarehouseAlignment,
  assertZaduzenjeWarehouseAlignment,
} from './assert-transfer-warehouse-alignment.util';

describe('assert-transfer-warehouse-alignment.util', () => {
  const warehouseResolution = {
    resolveForEmployee: async (employeeId: string) => {
      if (employeeId === 'emp-zenica') {
        return 'wh-ed';
      }
      if (employeeId === 'emp-central') {
        return 'wh-central';
      }
      return null;
    },
  };

  it('rejects zaduzenje when employee effective warehouse differs from equipment warehouse', async () => {
    await assert.rejects(
      () =>
        assertZaduzenjeWarehouseAlignment(
          warehouseResolution as never,
          { status: 'skladiste', warehouseId: 'wh-central' },
          'emp-zenica',
        ),
      (error: unknown) => error instanceof BadRequestException,
    );
  });

  it('allows zaduzenje when warehouses match', async () => {
    await assertZaduzenjeWarehouseAlignment(
      warehouseResolution as never,
      { status: 'skladiste', warehouseId: 'wh-central' },
      'emp-central',
    );
  });

  it('rejects prenos across different effective warehouses', async () => {
    await assert.rejects(
      () =>
        assertPrenosWarehouseAlignment(warehouseResolution as never, 'emp-zenica', 'emp-central'),
      (error: unknown) => error instanceof BadRequestException,
    );
  });

  it('allows prenos within same effective warehouse', async () => {
    await assertPrenosWarehouseAlignment(
      warehouseResolution as never,
      'emp-central',
      'emp-central',
    );
  });
});
