import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class InitializeSetupDto {
  @IsString()
  @MinLength(1)
  companyName!: string;

  @IsString()
  @MinLength(1)
  companyAddress!: string;

  @IsString()
  @MinLength(1)
  companyCity!: string;

  @IsOptional()
  @IsString()
  companyPostalCode?: string;

  @IsOptional()
  @IsString()
  companyPhone?: string;

  @IsOptional()
  @IsEmail()
  companyEmail?: string;

  @IsOptional()
  @IsString()
  companyTaxId?: string;

  @IsString()
  @MinLength(1)
  adminFirstName!: string;

  @IsString()
  @MinLength(1)
  adminLastName!: string;

  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @IsString()
  @MinLength(3)
  adminUsername!: string;

  @IsString()
  @MinLength(8)
  adminPassword!: string;

  @IsOptional()
  @IsString()
  setupToken?: string;
}
