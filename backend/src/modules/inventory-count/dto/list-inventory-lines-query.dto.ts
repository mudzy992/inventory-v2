import { IsEnum, IsOptional } from 'class-validator';
import { InventoryLineStatus } from '../../../../generated/prisma/client';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

export class ListInventoryLinesQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsEnum(InventoryLineStatus)
  status?: InventoryLineStatus;
}
