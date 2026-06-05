import { IsEnum } from 'class-validator';

export class ResolveDestDto {
  @IsEnum(['accept', 'reject'])
  action!: 'accept' | 'reject';
}
