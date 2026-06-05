import { IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateStockLotDto {
  @IsUUID()
  categoryId!: string;

  @ValidateIf((dto: CreateStockLotDto) => !dto.catalogItemId)
  @IsString()
  @MaxLength(255)
  productName?: string;

  @IsOptional()
  @IsUUID()
  catalogItemId?: string;

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
}
