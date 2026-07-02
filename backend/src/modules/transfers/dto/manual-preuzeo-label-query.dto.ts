import { IsOptional, IsUUID } from 'class-validator';

export class ManualPreuzeoLabelQueryDto {
  @IsOptional()
  @IsUUID()
  equipmentId?: string;
}
