import { IsUUID } from 'class-validator';

export class MapCatalogDto {
  @IsUUID()
  catalogItemId!: string;
}
