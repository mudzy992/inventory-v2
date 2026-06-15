import { BadRequestException } from '@nestjs/common';
import type { Equipment, TransferType } from '../../../generated/prisma/client';
import { CreateTransferDto } from './dto/create-transfer.dto';

export const validateTransferShape = (dto: CreateTransferDto): void => {
  if (dto.type === 'zaduzenje') {
    assertParty(dto.fromType === 'skladiste', 'zaduzenje requires fromType skladiste');
    assertParty(dto.toType === 'osoba', 'zaduzenje requires toType osoba');
    assertParty(Boolean(dto.toPersonId), 'zaduzenje requires toPersonId');
    assertParty(Boolean(dto.fromWarehouseId), 'zaduzenje requires fromWarehouseId');
    return;
  }
  if (dto.type === 'razduzenje') {
    assertParty(dto.fromType === 'osoba', 'razduzenje requires fromType osoba');
    assertParty(dto.toType === 'skladiste', 'razduzenje requires toType skladiste');
    assertParty(Boolean(dto.fromPersonId), 'razduzenje requires fromPersonId');
    assertParty(Boolean(dto.toWarehouseId), 'razduzenje requires toWarehouseId');
    return;
  }
  if (dto.type === 'rashodovanje') {
    assertParty(dto.toType === 'rashod', 'rashodovanje requires toType rashod');
    return;
  }
  if (dto.type === 'prenos') {
    assertParty(dto.fromType === 'osoba' && dto.toType === 'osoba', 'prenos requires osoba to osoba');
    assertParty(Boolean(dto.fromPersonId && dto.toPersonId), 'prenos requires from and to person');
  }
};

export const validateEquipmentForTransfer = (
  equipment: Equipment,
  dto: CreateTransferDto,
): void => {
  if (equipment.status === 'za_rashod') {
    throw new BadRequestException('Oprema je na listi za rashod i ne može se prenositi');
  }
  if (dto.type === 'zaduzenje' && equipment.status !== 'skladiste') {
    throw new BadRequestException('zaduzenje requires equipment in skladiste');
  }
  if (dto.type === 'razduzenje') {
    if (equipment.status !== 'zaduzeno') {
      throw new BadRequestException('razduzenje requires zaduzeno equipment');
    }
    if (equipment.currentHolderId !== dto.fromPersonId) {
      throw new BadRequestException('fromPersonId must match current holder');
    }
  }
  if (dto.type === 'prenos') {
    if (equipment.status !== 'zaduzeno') {
      throw new BadRequestException('prenos requires zaduzeno equipment');
    }
    if (equipment.currentHolderId !== dto.fromPersonId) {
      throw new BadRequestException('fromPersonId must match current holder');
    }
  }
  if (dto.type === 'rashodovanje' && equipment.status === 'rashodovano') {
    throw new BadRequestException('Equipment already rashodovano');
  }
};

const assertParty = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new BadRequestException(message);
  }
};

export const buildEquipmentUpdateOnFinalize = (
  type: TransferType,
  toPersonId: string | null | undefined,
  toWarehouseId: string | null | undefined,
): {
  status: Equipment['status'];
  currentHolderId: string | null;
  warehouseId: string | null;
  warehouseCondition: Equipment['warehouseCondition'];
} => {
  if (type === 'zaduzenje') {
    return {
      status: 'zaduzeno',
      currentHolderId: toPersonId ?? null,
      warehouseId: null,
      warehouseCondition: null,
    };
  }
  if (type === 'razduzenje') {
    return {
      status: 'skladiste',
      currentHolderId: null,
      warehouseId: toWarehouseId ?? null,
      warehouseCondition: 'na_skladistu',
    };
  }
  if (type === 'rashodovanje') {
    return {
      status: 'rashodovano',
      currentHolderId: null,
      warehouseId: toWarehouseId ?? null,
      warehouseCondition: 'na_skladistu',
    };
  }
  return {
    status: 'zaduzeno',
    currentHolderId: toPersonId ?? null,
    warehouseId: null,
    warehouseCondition: null,
  };
};

/** @deprecated use buildEquipmentUpdateOnFinalize */
export const buildEquipmentUpdateOnSign = buildEquipmentUpdateOnFinalize;
