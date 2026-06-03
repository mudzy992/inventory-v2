import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  TransferPartyType,
  TransferToType,
  TransferType,
} from '../../../../generated/prisma/client';

export class CreateTransferDto {
  @IsUUID()
  equipmentId!: string;

  @IsEnum(TransferType)
  type!: TransferType;

  @IsEnum(TransferPartyType)
  fromType!: TransferPartyType;

  @IsOptional()
  @IsUUID()
  fromPersonId?: string;

  @IsOptional()
  @IsUUID()
  fromWarehouseId?: string;

  @IsEnum(TransferToType)
  toType!: TransferToType;

  @IsOptional()
  @IsUUID()
  toPersonId?: string;

  @IsOptional()
  @IsUUID()
  toWarehouseId?: string;

  @IsOptional()
  @IsUUID()
  signerId?: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isCrossServiceTransfer?: boolean;
}
