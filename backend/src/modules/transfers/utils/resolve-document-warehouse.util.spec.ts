import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveDocumentWarehouseId } from './resolve-document-warehouse.util';

describe('resolve-document-warehouse.util', () => {
  it('uses fromWarehouseId for zaduzenje', () => {
    const actual = resolveDocumentWarehouseId({
      type: 'zaduzenje',
      fromWarehouseId: 'wh-a',
      toWarehouseId: null,
      equipmentWarehouseId: 'wh-b',
    });
    assert.equal(actual, 'wh-a');
  });

  it('uses toWarehouseId for razduzenje', () => {
    const actual = resolveDocumentWarehouseId({
      type: 'razduzenje',
      fromWarehouseId: null,
      toWarehouseId: 'wh-b',
      equipmentWarehouseId: 'wh-a',
    });
    assert.equal(actual, 'wh-b');
  });

  it('prefers resolved holder warehouse for prenos when equipment warehouse is null', () => {
    const actual = resolveDocumentWarehouseId({
      type: 'prenos',
      fromWarehouseId: null,
      toWarehouseId: null,
      equipmentWarehouseId: null,
      resolvedHolderWarehouseId: 'wh-holder',
      registrarAssignmentWarehouseId: 'wh-registrar',
    });
    assert.equal(actual, 'wh-holder');
  });

  it('falls back to registrar assignment warehouse for prenos', () => {
    const actual = resolveDocumentWarehouseId({
      type: 'prenos',
      fromWarehouseId: null,
      toWarehouseId: null,
      equipmentWarehouseId: null,
      resolvedHolderWarehouseId: null,
      registrarAssignmentWarehouseId: 'wh-registrar',
    });
    assert.equal(actual, 'wh-registrar');
  });

  it('uses documentWarehouseOverride when provided', () => {
    const actual = resolveDocumentWarehouseId({
      type: 'prenos',
      fromWarehouseId: 'wh-a',
      toWarehouseId: null,
      equipmentWarehouseId: null,
      resolvedHolderWarehouseId: 'wh-b',
      documentWarehouseOverride: 'wh-override',
    });
    assert.equal(actual, 'wh-override');
  });
});
