import { IsString, IsUUID, MinLength } from 'class-validator';

export class CheckSpecificationValueQueryDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @MinLength(1)
  fieldId!: string;

  @IsString()
  @MinLength(1)
  value!: string;
}
