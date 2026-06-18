import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { OrgUnitType } from '../../../../generated/prisma/client';

export class SetupOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  childUnitName?: string;

  @IsOptional()
  @IsEnum(OrgUnitType)
  childUnitType?: OrgUnitType;
}
