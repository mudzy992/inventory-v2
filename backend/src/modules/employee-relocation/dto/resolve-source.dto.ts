import { IsEnum } from 'class-validator';

export class ResolveSourceDto {
  @IsEnum(['transfer', 'discharge'])
  action!: 'transfer' | 'discharge';
}
