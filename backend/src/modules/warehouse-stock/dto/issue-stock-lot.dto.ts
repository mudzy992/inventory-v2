import { IsDateString, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class IssueStockLotDto {
  @IsUUID()
  employeeId!: string;

  @IsString()
  @MaxLength(120)
  inventoryNumber!: string;

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
