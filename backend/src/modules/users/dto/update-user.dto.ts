import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { UserRole } from '../../../../generated/prisma/client';
import { CoordinatorScopeDto } from './coordinator-scope.dto';
import { ModeratorOrgAssignmentDto, ModeratorWarehouseAssignmentDto } from './moderator-assignment.dto';
import { RegistrarScopeDto } from './registrar-scope.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsUUID()
  employeeId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RegistrarScopeDto)
  registrarScopes?: RegistrarScopeDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CoordinatorScopeDto)
  coordinatorAssignments?: CoordinatorScopeDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ModeratorOrgAssignmentDto)
  moderatorOrgAssignments?: ModeratorOrgAssignmentDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ModeratorWarehouseAssignmentDto)
  moderatorWarehouseAssignments?: ModeratorWarehouseAssignmentDto[];
}
