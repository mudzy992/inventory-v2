import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTransferTemplateData, resolvePreuzeoLabel } from './build-transfer-template-data.util';

const baseTransfer = {
  documentNumber: '1/2026',
  reason: null,
  notes: null,
  fromType: 'osoba',
  toType: 'skladiste',
  signer: { firstName: 'Ana', lastName: 'Anić' },
  fromPerson: { firstName: 'Marko', lastName: 'Marković' },
  toPerson: null,
  fromWarehouse: null,
  toWarehouse: { name: 'Skladište ED Zenica' },
  manualPreuzeoLabel: null,
  equipment: {
    inventoryNumber: 'INV-1',
    specifications: {},
    category: { name: 'Laptop', fields: [], optionalFields: [] },
    stockLot: null,
  },
};

describe('build-transfer-template-data.util', () => {
  it('resolvePreuzeoLabel uses warehouse name by default', () => {
    const label = resolvePreuzeoLabel(baseTransfer);
    assert.equal(label, 'Skladište: Skladište ED Zenica');
  });

  it('resolvePreuzeoLabel prefers manual override', () => {
    const label = resolvePreuzeoLabel({
      ...baseTransfer,
      manualPreuzeoLabel: 'Podružnica ED Zenica 360999',
    });
    assert.equal(label, 'Podružnica ED Zenica 360999');
  });

  it('buildTransferTemplateData maps preuzeo from override', () => {
    const data = buildTransferTemplateData({
      ...baseTransfer,
      manualPreuzeoLabel: 'Podružnica ED Zenica 360999',
    });
    assert.equal(data.preuzeo, 'Podružnica ED Zenica 360999');
  });
});
