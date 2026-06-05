import { IsOptional, IsUUID } from 'class-validator';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

export class ListSessionsQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsUUID()
  orgUnitId?: string;
}
