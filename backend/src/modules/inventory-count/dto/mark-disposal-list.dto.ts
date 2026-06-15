import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class MarkDisposalListDto {
  @IsUUID()
  equipmentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsUUID()
  signerId?: string;
}

export class WithdrawDisposalListDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
