import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';

export class SetupLocationDto {
  @IsString()
  @MinLength(1)
  cantonName!: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ArrayMinSize(1)
  @IsString({ each: true })
  cities!: string[];
}
