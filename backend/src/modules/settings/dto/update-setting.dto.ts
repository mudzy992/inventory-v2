import {
  IsDefined,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isSettingPrimitiveValue', async: false })
class IsSettingPrimitiveValueConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value === 'string') {
      return value.length <= 10_000;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value);
    }
    return typeof value === 'boolean';
  }

  defaultMessage(): string {
    return 'value must be a string, finite number, or boolean';
  }
}

export class UpdateSettingDto {
  @IsDefined()
  @Validate(IsSettingPrimitiveValueConstraint)
  value!: string | number | boolean;
}
