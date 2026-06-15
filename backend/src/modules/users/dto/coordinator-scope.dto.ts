import { IsOptional, IsUUID } from 'class-validator';

export class CoordinatorScopeDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  orgUnitId?: string | null;
}
