import { IsIn, IsOptional } from 'class-validator';

export class GeneratedDocumentFormatQueryDto {
  @IsOptional()
  @IsIn(['pdf', 'docx'])
  format?: 'pdf' | 'docx';
}
