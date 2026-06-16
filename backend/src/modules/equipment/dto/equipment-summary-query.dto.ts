import { IsOptional, IsUUID } from 'class-validator';

export class EquipmentSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
