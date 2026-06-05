import { IsOptional, IsUUID } from 'class-validator';

export class MaintenanceConsumptionQueryDto {
  @IsOptional()
  @IsUUID()
  hostCategoryId?: string;
}
