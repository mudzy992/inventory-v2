import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  assertMasterTransferGenerationEnabled,
  assertTransferCreationAllowed,
  isStockLotTransferDocumentEnabled,
} from './transfer-generation-policy.util';

const createSettings = (values: Record<string, boolean>) => ({
  getBooleanValue: async (key: string, defaultValue: boolean) =>
    values[key] ?? defaultValue,
});

describe('transfer-generation-policy.util', () => {
  it('assertMasterTransferGenerationEnabled throws when master is off', async () => {
    await assert.rejects(
      () => assertMasterTransferGenerationEnabled(createSettings({ 'transfer.generation.enabled': false })),
      BadRequestException,
    );
  });

  it('isStockLotTransferDocumentEnabled returns false when lot setting is off', async () => {
    const enabled = await isStockLotTransferDocumentEnabled(
      createSettings({ 'transfer.generation.on_stock_lot_issue': false }),
    );
    assert.equal(enabled, false);
  });

  it('isStockLotTransferDocumentEnabled returns true when master and lot are on', async () => {
    const enabled = await isStockLotTransferDocumentEnabled(createSettings({}));
    assert.equal(enabled, true);
  });

  it('assertTransferCreationAllowed still blocks stock_lot when lot setting is off', async () => {
    await assert.rejects(
      () =>
        assertTransferCreationAllowed(
          createSettings({ 'transfer.generation.on_stock_lot_issue': false }),
          'zaduzenje',
          'stock_lot',
        ),
      BadRequestException,
    );
  });
});
