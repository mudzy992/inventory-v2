import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { getSettingDefinition } from '../settings.registry';
import {
  assertPageSizeSettingRelationship,
  parseAndValidateNumericSetting,
} from './numeric-setting-validation.util';

const getDefinition = (key: string) => {
  const definition = getSettingDefinition(key);
  assert.ok(definition);
  return definition;
};

test('accepts bounded integer settings and numeric strings', () => {
  assert.equal(parseAndValidateNumericSetting('20', getDefinition('lists.default_page_size')), 20);
  assert.equal(parseAndValidateNumericSetting(100, getDefinition('upload.max_mb')), 100);
});

test('rejects non-finite, boolean, fractional, and out-of-range numbers', () => {
  const pageSize = getDefinition('lists.default_page_size');
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, true, ' ', '1.5', 0, 101]) {
    assert.throws(() => parseAndValidateNumericSetting(invalid, pageSize), BadRequestException);
  }
});

test('enforces default and maximum page-size ordering', () => {
  assert.doesNotThrow(() => assertPageSizeSettingRelationship('lists.default_page_size', 25, 100));
  assert.throws(
    () => assertPageSizeSettingRelationship('lists.default_page_size', 101, 100),
    BadRequestException,
  );
  assert.throws(
    () => assertPageSizeSettingRelationship('lists.max_page_size', 20, 25),
    BadRequestException,
  );
});
