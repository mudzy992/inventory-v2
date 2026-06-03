import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsUUID()
  cityId!: string;

  @IsOptional()
  @IsUUID()
  orgUnitId?: string;

  @IsString()
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID('4', { each: true })
  keeperUserIds?: string[];
}
