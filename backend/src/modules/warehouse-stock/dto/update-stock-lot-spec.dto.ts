import { IsObject } from 'class-validator';

export class UpdateStockLotSpecDto {
  @IsObject()
  specifications!: Record<string, string>;
}
