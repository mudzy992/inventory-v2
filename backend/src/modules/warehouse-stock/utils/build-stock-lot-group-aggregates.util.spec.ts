import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyHistoricalTotalsToProductGroups,
  buildStockLotHistoricalTotalsByGroup,
  buildStockLotProductGroupsFromLots,
  type StockLotGroupLotRow,
} from './build-stock-lot-group-aggregates.util';

const category = { name: 'Printeri' };

const activeLot: StockLotGroupLotRow = {
  warehouseId: 'wh-sarajevo',
  catalogItemId: 'catalog-1',
  categoryId: 'cat-1',
  productName: 'Printer HP',
  quantityOnHand: 0,
  quantityReceived: 7,
  status: 'spremno_za_izdavanje',
  category,
};

const closedLot: StockLotGroupLotRow = {
  warehouseId: 'wh-zenica',
  catalogItemId: 'catalog-1',
  categoryId: 'cat-1',
  productName: 'Printer HP',
  quantityOnHand: 0,
  quantityReceived: 1,
  status: 'zatvoreno',
  category,
};

describe('buildStockLotProductGroupsFromLots', () => {
  it('aggregates only provided lots', () => {
    const groups = buildStockLotProductGroupsFromLots([activeLot]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.totalOnHand, 0);
    assert.equal(groups[0]?.totalReceived, 7);
    assert.equal(groups[0]?.warehouseCount, 1);
  });
});

describe('buildStockLotHistoricalTotalsByGroup', () => {
  it('sums received and warehouses across active and closed lots', () => {
    const historical = buildStockLotHistoricalTotalsByGroup([activeLot, closedLot]);
    const totals = historical.get('catalog:catalog-1');
    assert.equal(totals?.totalReceived, 8);
    assert.equal(totals?.warehouseCount, 2);
  });
});

describe('applyHistoricalTotalsToProductGroups', () => {
  it('overlays historical totals onto active-only groups', () => {
    const groups = buildStockLotProductGroupsFromLots([activeLot]);
    const historical = buildStockLotHistoricalTotalsByGroup([activeLot, closedLot]);
    const merged = applyHistoricalTotalsToProductGroups(groups, historical);
    assert.equal(merged[0]?.totalOnHand, 0);
    assert.equal(merged[0]?.totalReceived, 8);
    assert.equal(merged[0]?.warehouseCount, 2);
  });
});
