import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

const STOCK_LOT_STATUSES = ['ceka_specifikaciju', 'spremno_za_izdavanje', 'zatvoreno'] as const;

export class ListStockLotsQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(STOCK_LOT_STATUSES)
  status?: (typeof STOCK_LOT_STATUSES)[number];

  @IsOptional()
  groupKey?: string;
}
