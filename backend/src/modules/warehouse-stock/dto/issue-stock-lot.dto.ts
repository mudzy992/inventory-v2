import { IsDateString, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class IssueStockLotDto {
  @IsUUID()
  employeeId!: string;

  @IsString()
  @MaxLength(120)
  inventoryNumber!: string;

  @IsObject()
  uniqueSpecifications!: Record<string, string>;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsUUID()
  signerId?: string;
}
