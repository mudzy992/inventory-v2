import { IsInt, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInventorySessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  orgUnitId!: string;

  @IsInt()
  year!: number;
}
