import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListEmployeesQueryDto {
  @IsOptional()
  @IsUUID()
  orgUnitId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
