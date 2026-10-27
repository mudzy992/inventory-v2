import { IsOptional, IsUUID } from 'class-validator';

export class CommitteeSetupOptionsQueryDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  excludeCommitteeId?: string;
}
