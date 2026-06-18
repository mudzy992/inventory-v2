import { Type } from 'class-transformer';
import { IsString, MinLength, ValidateNested } from 'class-validator';

export class SetupEmployeeDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  @MinLength(1)
  title!: string;
}

export class SetupRoleAccountDto {
  @ValidateNested()
  @Type(() => SetupEmployeeDto)
  employee!: SetupEmployeeDto;

  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class SetupRolesDto {
  @ValidateNested()
  @Type(() => SetupRoleAccountDto)
  evidenticar!: SetupRoleAccountDto;

  @ValidateNested()
  @Type(() => SetupRoleAccountDto)
  skladistar!: SetupRoleAccountDto;

  @ValidateNested()
  @Type(() => SetupRoleAccountDto)
  popis_koordinator!: SetupRoleAccountDto;

  @ValidateNested()
  @Type(() => SetupRoleAccountDto)
  user!: SetupRoleAccountDto;
}
