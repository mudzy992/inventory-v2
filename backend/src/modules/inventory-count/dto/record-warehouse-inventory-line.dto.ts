import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class RecordWarehouseInventoryLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  stockLotId!: string;

  @IsIn(['prisutna', 'nije_prisutna', 'ostecena'])
  status!: 'prisutna' | 'nije_prisutna' | 'ostecena';

  @IsInt()
  @Min(0)
  quantityCounted!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
