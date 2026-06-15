import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReactivateEquipmentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;
}
