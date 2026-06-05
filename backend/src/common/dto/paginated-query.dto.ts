import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export class PaginatedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @IsString()
  search?: string;
}
