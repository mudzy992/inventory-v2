import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class SignTransferDto {
  @IsOptional()
  @IsUUID()
  signerId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
