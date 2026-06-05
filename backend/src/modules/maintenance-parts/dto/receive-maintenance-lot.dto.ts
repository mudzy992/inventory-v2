import { IsDateString, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class ReceiveMaintenanceLotDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @MaxLength(255)
  productName!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsDateString()
  entryDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contractNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  legacySpecs?: Record<string, string | number | boolean>;
}
