import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CategoryFieldDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsIn(['text', 'number', 'date', 'select'])
  type!: 'text' | 'number' | 'date' | 'select';

  @IsBoolean()
  required!: boolean;

  @IsBoolean()
  unique!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  options?: string[];
}
