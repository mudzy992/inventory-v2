import { BadRequestException } from '@nestjs/common';
import type { Equipment } from '../../../generated/prisma/client';
import type { WarehouseResolutionService } from '../services/warehouse-resolution.service';

export const ZADUZENJE_WAREHOUSE_ALIGNMENT_MESSAGE =
  'Radnik ne pripada efektivnom skladištu na kojem se oprema vodi.';

export const PRENOS_WAREHOUSE_ALIGNMENT_MESSAGE =
  'Prenos je dozvoljen samo između radnika istog efektivnog skladišta.';

export const assertZaduzenjeWarehouseAlignment = async (
  warehouseResolution: WarehouseResolutionService,
  equipment: Pick<Equipment, 'status' | 'warehouseId'>,
  toPersonId: string,
): Promise<void> => {
  if (equipment.status !== 'skladiste' || !equipment.warehouseId) {
    throw new BadRequestException('Zaduženje zahtijeva opremu na skladištu.');
  }
  const targetWarehouseId = await warehouseResolution.resolveForEmployee(toPersonId);
  if (!targetWarehouseId || targetWarehouseId !== equipment.warehouseId) {
    throw new BadRequestException(ZADUZENJE_WAREHOUSE_ALIGNMENT_MESSAGE);
  }
};

export const assertPrenosWarehouseAlignment = async (
  warehouseResolution: WarehouseResolutionService,
  fromPersonId: string,
  toPersonId: string,
): Promise<void> => {
  const [fromWarehouseId, toWarehouseId] = await Promise.all([
    warehouseResolution.resolveForEmployee(fromPersonId),
    warehouseResolution.resolveForEmployee(toPersonId),
  ]);
  if (!fromWarehouseId || !toWarehouseId || fromWarehouseId !== toWarehouseId) {
    throw new BadRequestException(PRENOS_WAREHOUSE_ALIGNMENT_MESSAGE);
  }
};
