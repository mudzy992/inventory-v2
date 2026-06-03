import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCityDto {
  @IsUUID()
  cantonId!: string;

  @IsString()
  @MaxLength(255)
  name!: string;
}
