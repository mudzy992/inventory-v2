import { IsEnum, IsObject, IsString, MaxLength } from 'class-validator';
import { EquipmentAffiliation } from '../../../../generated/prisma/client';

export class CommissionStockLotDto {
  @IsString()
  @MaxLength(120)
  inventoryNumber!: string;

  @IsEnum(EquipmentAffiliation)
  affiliation!: EquipmentAffiliation;

  /** All unit-level fields (`Category.fields`) for the commissioned piece. */
  @IsObject()
  uniqueSpecifications!: Record<string, string>;
}
