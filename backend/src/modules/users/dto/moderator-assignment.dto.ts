import { IsUUID } from 'class-validator';

export class ModeratorOrgAssignmentDto {
  @IsUUID()
  orgUnitId!: string;
}

export class ModeratorWarehouseAssignmentDto {
  @IsUUID()
  warehouseId!: string;
}
