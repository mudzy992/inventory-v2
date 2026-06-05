import { IsOptional, IsUUID } from 'class-validator';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

export class ListDisposalCommissionsQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsUUID()
  cityId?: string;
}
