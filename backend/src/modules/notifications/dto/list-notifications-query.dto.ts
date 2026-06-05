import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

export class ListNotificationsQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unread?: boolean;
}
