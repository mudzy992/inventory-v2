import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isStockLotTransferDocumentEnabled,
  isTransferDocumentEnabled,
} from './transfer-generation-policy.util';

const createSettings = (values: Record<string, boolean>) => ({
  getBooleanValue: async (key: string, defaultValue: boolean) =>
    values[key] ?? defaultValue,
});

describe('transfer-generation-policy.util', () => {
  it('isTransferDocumentEnabled returns false when master is off', async () => {
    const enabled = await isTransferDocumentEnabled(
      createSettings({ 'transfer.generation.enabled': false }),
      'prenos',
      'api',
    );
    assert.equal(enabled, false);
  });

  it('isStockLotTransferDocumentEnabled returns false when lot setting is off', async () => {
    const enabled = await isStockLotTransferDocumentEnabled(
      createSettings({ 'transfer.generation.on_stock_lot_issue': false }),
    );
    assert.equal(enabled, false);
  });

  it('isStockLotTransferDocumentEnabled returns false when master is off', async () => {
    const enabled = await isStockLotTransferDocumentEnabled(
      createSettings({ 'transfer.generation.enabled': false }),
    );
    assert.equal(enabled, false);
  });

  it('isStockLotTransferDocumentEnabled returns true when master and lot are on', async () => {
    const enabled = await isStockLotTransferDocumentEnabled(createSettings({}));
    assert.equal(enabled, true);
  });

  it('isTransferDocumentEnabled returns false when per-type setting is off', async () => {
    const enabled = await isTransferDocumentEnabled(
      createSettings({ 'transfer.generation.on_prenos': false }),
      'prenos',
      'api',
    );
    assert.equal(enabled, false);
  });
});
