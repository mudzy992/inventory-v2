import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class MarkDisposalListDto {
  @IsUUID()
  equipmentId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(2000)
  note!: string;
}

export class WithdrawDisposalListDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
