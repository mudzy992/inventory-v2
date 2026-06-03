import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TransferStatus } from '../../../../generated/prisma/client';

export class ListTransfersQueryDto {
  @IsOptional()
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;
}
