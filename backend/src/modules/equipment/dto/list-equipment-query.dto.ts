import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { EquipmentStatus } from '../../../../generated/prisma/client';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

export class ListEquipmentQueryDto extends PaginatedQueryDto {
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
