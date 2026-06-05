import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export const AUTOCOMPLETE_SEARCH_LIMIT = 20;
export const AUTOCOMPLETE_MIN_CHARS = 2;

export class AutocompleteSearchQueryDto {
  @IsString()
  @MinLength(AUTOCOMPLETE_MIN_CHARS)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AUTOCOMPLETE_SEARCH_LIMIT)
  limit?: number = AUTOCOMPLETE_SEARCH_LIMIT;
}
