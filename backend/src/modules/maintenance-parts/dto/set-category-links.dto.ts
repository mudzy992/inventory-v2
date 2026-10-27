import {
  ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class SetCategoryMaintenanceLinksDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  maintenanceCategoryIds!: string[];
}
