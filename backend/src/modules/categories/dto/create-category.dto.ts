import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { CategoryFieldDto } from './category-field.dto';

export class CreateCategoryDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryFieldDto)
  fields!: CategoryFieldDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryFieldDto)
  optionalFields?: CategoryFieldDto[];
}
