import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasRequiredLotSpecFields,
  normalizeLotCategoryFields,
  normalizeUnitCategoryFields,
  validateEquipmentSpecifications,
  validateIssueSpecifications,
  validateLotSpecifications,
} from './category-fields.util';

const unitFields = [
  { id: 'sn', name: 'Serijski broj', type: 'text' as const, required: false, unique: true },
  { id: 'owner', name: 'Vlasnik', type: 'select' as const, required: false, unique: false, options: ['A', 'B'] },
];

const lotFields = [
  { id: 'brand', name: 'Proizvođač', type: 'text' as const, required: true, unique: false },
  { id: 'note', name: 'Napomena', type: 'text' as const, required: false, unique: false },
];

describe('category-fields.util', () => {
  it('normalizes unit fields as always required', () => {
    const actual = normalizeUnitCategoryFields(unitFields);
    assert.equal(actual[0].required, true);
    assert.equal(actual[1].unique, false);
  });

  it('rejects unique lot fields', () => {
    assert.throws(
      () =>
        normalizeLotCategoryFields([
          { id: 'x', name: 'X', type: 'text', required: true, unique: true },
        ]),
      /ne može biti unikatno/i,
    );
  });

  it('validates lot spec only for required lot fields', () => {
    assert.doesNotThrow(() => validateLotSpecifications({ brand: 'HP' }, lotFields));
    assert.throws(() => validateLotSpecifications({}, lotFields), /Proizvođač/i);
  });

  it('validates all unit fields on issue', () => {
    assert.throws(
      () => validateIssueSpecifications({ sn: 'SN-1' }, unitFields),
      /Vlasnik/i,
    );
    assert.doesNotThrow(() =>
      validateIssueSpecifications({ sn: 'SN-1', owner: 'A' }, unitFields),
    );
  });

  it('allows repeating unit values when not unique', () => {
    assert.doesNotThrow(() =>
      validateIssueSpecifications({ sn: 'SN-1', owner: 'A' }, unitFields),
    );
    assert.doesNotThrow(() =>
      validateIssueSpecifications({ sn: 'SN-2', owner: 'A' }, unitFields),
    );
  });

  it('validates equipment with required unit and lot fields', () => {
    assert.doesNotThrow(() =>
      validateEquipmentSpecifications(
        { sn: 'SN-1', owner: 'A', brand: 'HP' },
        unitFields,
        lotFields,
      ),
    );
    assert.throws(
      () => validateEquipmentSpecifications({ sn: 'SN-1', owner: 'A' }, unitFields, lotFields),
      /Proizvođač/i,
    );
  });

  it('detects required lot fields', () => {
    assert.equal(hasRequiredLotSpecFields(lotFields), true);
    assert.equal(
      hasRequiredLotSpecFields([{ id: 'n', name: 'N', type: 'text', required: false, unique: false }]),
      false,
    );
  });
});
