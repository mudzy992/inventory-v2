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

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return value === 'true' || value === true;
  })
  @IsBoolean()
  isActive?: boolean;
}
