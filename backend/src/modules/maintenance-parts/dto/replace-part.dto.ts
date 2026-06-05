import { IsInt, IsObject, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ReplaceMaintenancePartDto {
  @IsUUID()
  stockLotId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsObject()
  legacySpecs?: Record<string, string | number | boolean>;

  @IsOptional()
  @IsString()
  notes?: string;
}
