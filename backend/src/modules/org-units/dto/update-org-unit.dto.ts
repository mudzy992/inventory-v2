import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { OrgUnitType } from '../../../../generated/prisma/client';

export class UpdateOrgUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(OrgUnitType)
  type?: OrgUnitType;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsUUID()
  signerId?: string | null;

  @IsOptional()
  @IsUUID()
  locationCityId?: string | null;
}
