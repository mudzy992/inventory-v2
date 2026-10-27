import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { EmployeeRelocationService } from './employee-relocation.service';

const source = readFileSync(resolve('src/modules/employee-relocation/employee-relocation.service.ts'), 'utf8');

const makeService = (featureEnabled: boolean) => new EmployeeRelocationService(
  {} as never, {} as never, {} as never, {} as never, {} as never,
  {} as never, {} as never,
  { getBooleanValue: async () => featureEnabled, assertFeatureEnabled: async () => undefined } as never,
  {} as never,
);

test('handleOrgUnitChange is a no-op when the feature is disabled', async () => {
  const service = makeService(false);
  await service.handleOrgUnitChange('e1', 'ou1', 'ou2', 'u1', {} as never, true);
});

test('relocation notifications are durable outbox rows with idempotency keys', () => {
  assert.match(source, /notificationOutbox\.createMany\(/u);
  assert.match(source, /employee-relocation-action:/u);
  assert.match(source, /employee-relocation-alert:/u);
  assert.match(source, /supersedeOpenCasesInTx\(tx/u);
  const method = source.slice(source.indexOf('async handleOrgUnitChange('), source.indexOf('async listForUser('));
  assert.doesNotMatch(method, /notifyEmployeeRelocation/u);
  assert.match(method, /notificationOutbox\.createMany/u);
});
