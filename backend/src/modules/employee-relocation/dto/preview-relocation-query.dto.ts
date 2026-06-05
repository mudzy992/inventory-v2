import { IsUUID } from 'class-validator';

export class PreviewRelocationQueryDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  newOrgUnitId!: string;
}
