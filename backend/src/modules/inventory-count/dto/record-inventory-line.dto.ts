import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RecordInventoryLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  equipmentId!: string;

  @IsIn(['prisutna', 'ostecena', 'promjena_lokacije', 'nije_prisutna', 'predlozen_rashod'])
  status!: 'prisutna' | 'ostecena' | 'promjena_lokacije' | 'nije_prisutna' | 'predlozen_rashod';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsIn(['skladiste', 'osoba'])
  relocationTargetType?: 'skladiste' | 'osoba';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  relocationWarehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  relocationToPersonId?: string;
}
