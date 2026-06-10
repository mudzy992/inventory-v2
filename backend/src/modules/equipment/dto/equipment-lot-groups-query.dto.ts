import { IsUUID } from 'class-validator';

export class EquipmentLotGroupsQueryDto {
  @IsUUID()
  categoryId!: string;
}
