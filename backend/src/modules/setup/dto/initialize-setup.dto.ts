import { Type } from 'class-transformer';
import { IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { SetupAdminDto } from './setup-admin.dto';
import { SetupCatalogDto } from './setup-catalog-item.dto';
import { SetupCategoryDto } from './setup-catalog.dto';
import { SetupCompanyDto } from './setup-company.dto';
import { SetupDirectorDto } from './setup-director.dto';
import { SetupLocationDto } from './setup-location.dto';
import { SetupOrganizationDto } from './setup-organization.dto';
import { SetupRolesDto } from './setup-role-account.dto';
import { SetupWarehouseDto } from './setup-warehouse.dto';

export class InitializeSetupDto {
  @ValidateNested()
  @Type(() => SetupCompanyDto)
  company!: SetupCompanyDto;

  @ValidateNested()
  @Type(() => SetupLocationDto)
  location!: SetupLocationDto;

  @ValidateNested()
  @Type(() => SetupOrganizationDto)
  organization!: SetupOrganizationDto;

  @ValidateNested()
  @Type(() => SetupWarehouseDto)
  warehouse!: SetupWarehouseDto;

  @ValidateNested()
  @Type(() => SetupCategoryDto)
  category!: SetupCategoryDto;

  @ValidateNested()
  @Type(() => SetupCatalogDto)
  catalog!: SetupCatalogDto;

  @ValidateNested()
  @Type(() => SetupAdminDto)
  admin!: SetupAdminDto;

  @ValidateNested()
  @Type(() => SetupRolesDto)
  roles!: SetupRolesDto;

  @ValidateNested()
  @Type(() => SetupDirectorDto)
  director!: SetupDirectorDto;

  @IsOptional()
  @IsString()
  setupToken?: string;
}
