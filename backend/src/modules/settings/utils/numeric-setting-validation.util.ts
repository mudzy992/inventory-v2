import { BadRequestException } from '@nestjs/common';
import type { SettingDefinition } from '../settings.registry';

export const parseAndValidateNumericSetting = (
  value: string | number | boolean,
  definition: SettingDefinition,
): number => {
  if (typeof value === 'boolean' || (typeof value === 'string' && value.trim() === '')) {
    throw new BadRequestException(`Invalid number value for setting: ${definition.key}`);
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new BadRequestException(`Invalid number value for setting: ${definition.key}`);
  }
  if (definition.integer && !Number.isInteger(numeric)) {
    throw new BadRequestException(`Setting must be an integer: ${definition.key}`);
  }
  if (
    (definition.minValue !== undefined && numeric < definition.minValue) ||
    (definition.maxValue !== undefined && numeric > definition.maxValue)
  ) {
    throw new BadRequestException(`Setting value is outside the allowed range: ${definition.key}`);
  }
  return numeric;
};

export const assertPageSizeSettingRelationship = (
  key: string,
  value: number,
  otherValue: number,
): void => {
  if (!Number.isFinite(otherValue) || !Number.isInteger(otherValue) || otherValue < 1) {
    throw new BadRequestException('The related page-size setting must be corrected first');
  }
  if (key === 'lists.default_page_size' && value > otherValue) {
    throw new BadRequestException('Default page size cannot exceed the maximum page size');
  }
  if (key === 'lists.max_page_size' && value < otherValue) {
    throw new BadRequestException('Maximum page size cannot be below the default page size');
  }
};
