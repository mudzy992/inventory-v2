import { IsString, MinLength } from 'class-validator';

export class CheckInventoryNumberQueryDto {
  @IsString()
  @MinLength(1)
  value!: string;
}
