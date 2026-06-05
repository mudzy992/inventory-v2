import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { CategoryKind } from '../../../../generated/prisma/client';
import { CategoryFieldDto } from './category-field.dto';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsEnum(CategoryKind)
  categoryKind?: CategoryKind;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryFieldDto)
  fields?: CategoryFieldDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryFieldDto)
  optionalFields?: CategoryFieldDto[];
}
