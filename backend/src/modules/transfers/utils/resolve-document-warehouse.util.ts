import { BadRequestException } from '@nestjs/common';
import type { TransferType } from '../../../../generated/prisma/client';

export interface ResolveDocumentWarehouseInput {
  type: TransferType;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  equipmentWarehouseId: string | null;
  resolvedHolderWarehouseId?: string | null;
}

export const resolveDocumentWarehouseId = (input: ResolveDocumentWarehouseInput): string => {
  if (input.type === 'zaduzenje') {
    if (!input.fromWarehouseId) {
      throw new BadRequestException('Zaduženje zahtijeva skladište izvora za prenosnicu');
    }
    return input.fromWarehouseId;
  }
  if (input.type === 'razduzenje') {
    if (!input.toWarehouseId) {
      throw new BadRequestException('Razduženje zahtijeva ciljno skladište za prenosnicu');
    }
    return input.toWarehouseId;
  }
  if (input.type === 'rashodovanje') {
    const warehouseId = input.fromWarehouseId ?? input.equipmentWarehouseId;
    if (!warehouseId) {
      throw new BadRequestException('Rashod zahtijeva skladište za prenosnicu');
    }
    return warehouseId;
  }
  const warehouseId =
    input.equipmentWarehouseId ?? input.resolvedHolderWarehouseId ?? input.fromWarehouseId;
  if (!warehouseId) {
    throw new BadRequestException('Prenos zahtijeva povezano skladište za prenosnicu');
  }
  return warehouseId;
};
