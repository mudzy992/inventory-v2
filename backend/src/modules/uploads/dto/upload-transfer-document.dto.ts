import { IsUUID } from 'class-validator';

export class UploadTransferDocumentDto {
  @IsUUID()
  transferId!: string;
}
