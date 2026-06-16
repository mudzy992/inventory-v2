import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { EquipmentStatus, WarehouseCondition, EquipmentAffiliation } from '../../../../generated/prisma/client';

export class UpdateEquipmentDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  inventoryNumber?: string;

  @IsOptional()
  @IsEnum(EquipmentAffiliation)
  affiliation?: EquipmentAffiliation;

  @IsOptional()
  @IsObject()
  specifications?: Record<string, string>;

  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contractNumber?: string;

  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @IsOptional()
  @IsUUID()
  currentHolderId?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string | null;

  @IsOptional()
  @IsEnum(WarehouseCondition)
  warehouseCondition?: WarehouseCondition | null;
}
