import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BulkStockLotItemDto {
  @IsUUID()
  categoryId!: string;

  @IsUUID()
  catalogItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsDateString()
  entryDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contractNumber?: string;
}

export class BulkCreateStockLotDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BulkStockLotItemDto)
  items!: BulkStockLotItemDto[];
}
