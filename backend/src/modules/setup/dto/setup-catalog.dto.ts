import { IsString, MinLength } from 'class-validator';

export class SetupCategoryDto {
  @IsString()
  @MinLength(1)
  parentName!: string;

  @IsString()
  @MinLength(1)
  leafName!: string;
}
