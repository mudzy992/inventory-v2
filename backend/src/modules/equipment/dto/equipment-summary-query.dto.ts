import { IsOptional, IsUUID } from 'class-validator';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

export class EquipmentSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
