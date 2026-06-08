import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

export class ListEmployeesQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsUUID()
  orgUnitId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  withoutUserAccount?: boolean;
}
