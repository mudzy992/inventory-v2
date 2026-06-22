import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { TransferStatus } from '../../../../generated/prisma/client';
import { PaginatedQueryDto } from '../../../common/dto/paginated-query.dto';

export const TRANSFER_WORKFLOW_FILTERS = ['pending', 'signed'] as const;
export type TransferWorkflowFilter = (typeof TRANSFER_WORKFLOW_FILTERS)[number];

export class ListTransfersQueryDto extends PaginatedQueryDto {
  @IsOptional()
  @IsUUID()
  equipmentId?: string;

  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsIn(TRANSFER_WORKFLOW_FILTERS)
  workflow?: TransferWorkflowFilter;
}
