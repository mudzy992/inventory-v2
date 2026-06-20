import { EmployeeGender } from '../../../../generated/prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MaxLength(120)
  lastName!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsUUID()
  orgUnitId!: string;

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
