import { IsArray, IsUUID } from 'class-validator';

export class SetCategoryMaintenanceLinksDto {
  @IsArray()
  @IsUUID('4', { each: true })
  maintenanceCategoryIds!: string[];
}
