import { IsObject, IsString, MaxLength } from 'class-validator';

export class CommissionStockLotDto {
  @IsString()
  @MaxLength(120)
  inventoryNumber!: string;

  /** All unit-level fields (`Category.fields`) for the commissioned piece. */
  @IsObject()
  uniqueSpecifications!: Record<string, string>;
}
