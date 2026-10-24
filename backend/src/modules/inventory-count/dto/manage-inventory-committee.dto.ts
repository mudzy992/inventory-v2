import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InventoryCommitteeMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  employeeId!: string;

  @IsIn(['predsjednik', 'clan'])
  role!: 'predsjednik' | 'clan';
}

export class ManageInventoryCommitteeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  warehouseId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  categoryId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InventoryCommitteeMemberDto)
  inventoryMembers!: InventoryCommitteeMemberDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InventoryCommitteeMemberDto)
  disposalMembers!: InventoryCommitteeMemberDto[];
}
