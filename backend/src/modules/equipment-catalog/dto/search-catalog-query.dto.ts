import { IsOptional, IsString, IsUUID } from 'class-validator';

export class SearchCatalogQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
