import { EmployeeGender } from '../../../../generated/prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsUUID()
  orgUnitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  staffNumber?: string;

  @IsOptional()
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
}
