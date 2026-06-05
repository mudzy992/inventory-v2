import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TransferStatus } from '../../../../generated/prisma/client';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

export class ListTransfersQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
