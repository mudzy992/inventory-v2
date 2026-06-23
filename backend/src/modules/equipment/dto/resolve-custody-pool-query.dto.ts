import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ResolveCustodyPoolQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  inventoryNumber!: string;
}
