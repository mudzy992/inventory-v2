import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewDisposalApprovalDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
