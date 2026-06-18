import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, IsEnum } from 'class-validator';
import { EquipmentAffiliation, EquipmentStatus } from '../../../../generated/prisma/client';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

export class ListEquipmentQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  @IsOptional()
  @IsEnum(EquipmentAffiliation)
  affiliation?: EquipmentAffiliation;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isAccountingTracked?: boolean;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  currentHolderId?: string;

  /** UUID lota ili literal `none` za opremu bez lota */
  @IsOptional()
  stockLotId?: string;

  @IsOptional()
  @IsUUID()
  specFieldId?: string;

  @IsOptional()
  @IsString()
  specValue?: string;
}
