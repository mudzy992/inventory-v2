import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadTransferTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}
