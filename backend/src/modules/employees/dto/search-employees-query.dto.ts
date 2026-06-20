import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { AutocompleteSearchQueryDto } from '../../../common/dto/autocomplete-search-query.dto';

export class SearchEmployeesQueryDto extends AutocompleteSearchQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return true;
    }
    return value === 'true' || value === true;
  })
  @IsBoolean()
  activeOnly?: boolean;
}
