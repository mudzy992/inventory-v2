import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { EquipmentStatus, WarehouseCondition } from '../../../../generated/prisma/client';

export class CreateEquipmentDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @MaxLength(120)
  inventoryNumber!: string;

  @IsObject()
  specifications!: Record<string, string>;

  @IsEnum(EquipmentStatus)
  status!: EquipmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contractNumber?: string;

  @IsDateString()
  entryDate!: string;

  @IsOptional()
  @IsUUID()
  currentHolderId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsEnum(WarehouseCondition)
  warehouseCondition?: WarehouseCondition;
}
