import { IsOptional, IsString, MinLength } from 'class-validator';

export class SetupWarehouseDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;
}
