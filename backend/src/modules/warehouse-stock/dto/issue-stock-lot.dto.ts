import { IsBoolean, IsDateString, IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { EquipmentAffiliation } from '../../../../generated/prisma/client';

export class IssueStockLotDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsBoolean()
  isAccountingTracked?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  inventoryNumber?: string;

  @IsEnum(EquipmentAffiliation)
  affiliation!: EquipmentAffiliation;

  /** All unit-level fields (`Category.fields`) for the issued piece. */
  @IsObject()
  uniqueSpecifications!: Record<string, string>;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsUUID()
  signerId?: string;
}
