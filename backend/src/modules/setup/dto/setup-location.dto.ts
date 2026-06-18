import { ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';

export class SetupLocationDto {
  @IsString()
  @MinLength(1)
  cantonName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  cities!: string[];
}
