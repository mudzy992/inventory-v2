import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { EquipmentStatus } from '../../../../generated/prisma/client';

export class ListEquipmentQueryDto {
  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  currentHolderId?: string;
}
