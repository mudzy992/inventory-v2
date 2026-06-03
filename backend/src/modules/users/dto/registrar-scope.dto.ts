import { IsOptional, IsUUID } from 'class-validator';

export class RegistrarScopeDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  orgUnitId?: string | null;
}
