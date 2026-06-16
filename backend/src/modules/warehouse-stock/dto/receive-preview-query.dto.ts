import { IsUUID } from 'class-validator';

export class ReceivePreviewQueryDto {
  @IsUUID()
  catalogItemId!: string;
}

