import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMaintenancePartNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
