import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateCityDto {
  @IsOptional()
  @IsUUID()
  cantonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}
