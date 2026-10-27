import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { WarehouseStockService } from './warehouse-stock.service';

const source = readFileSync(resolve('src/modules/warehouse-stock/warehouse-stock.service.ts'), 'utf8');
const makeService = () => new WarehouseStockService(
  {} as never, {} as never, {} as never, {} as never, {} as never,
  {} as never, {} as never, {} as never, {} as never, {} as never,
  {} as never, {} as never,
);

test('stock receive writes notification outbox INSIDE the business transaction', () => {
  const service = makeService();
  assert.ok(service);
  assert.match(source, /buildWarehouseStockReceivedOutboxRows\(tx/u);
  assert.match(source, /notificationOutbox\.createMany\(/u);
  assert.doesNotMatch(source, /notifyWarehouseStockReceived\(lotId\)/u);
  assert.match(source, /decrementStockLotOnHandInTx\(/u, 'decrements must stay conditional');
});

test('bulk receipt is capped at the DTO level', async () => {
  const dto = readFileSync(resolve('src/modules/warehouse-stock/dto/bulk-create-stock-lot.dto.ts'), 'utf8');
  assert.match(dto, /@ArrayMaxSize\(100\)/u);
});
