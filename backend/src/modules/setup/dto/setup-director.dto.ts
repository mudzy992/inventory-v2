import { IsString, MinLength } from 'class-validator';

export class SetupDirectorDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  @MinLength(1)
  title!: string;
}
