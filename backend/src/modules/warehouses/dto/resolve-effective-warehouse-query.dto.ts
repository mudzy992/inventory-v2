import { IsOptional, IsUUID } from 'class-validator';

export class ResolveEffectiveWarehouseQueryDto {
  @IsUUID()
  orgUnitId!: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;
}
