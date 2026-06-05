import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

export class SearchCatalogQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** @deprecated use search */
  @IsOptional()
  @IsString()
  q?: string;
}
