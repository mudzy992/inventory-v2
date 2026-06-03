import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCantonDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;
}
