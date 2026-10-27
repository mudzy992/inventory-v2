import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { EmployeesService } from './employees.service';

const source = readFileSync(resolve('src/modules/employees/employees.service.ts'), 'utf8');

test('org-unit change relocation is durable: executed inside the employee transaction', () => {
  assert.match(source, /relocationNeeded/u);
  assert.match(source, /handleOrgUnitChange\(/u);
  const txStart = source.indexOf('$transaction(async (tx)');
  assert.ok(txStart > 0);
  const txBlock = source.slice(txStart, txStart + 1600);
  assert.match(txBlock, /handleOrgUnitChange\(/u, 'must be inside $transaction');
  assert.match(txBlock, /\btx\b/u);
  assert.equal((source.match(/handleOrgUnitChange\(/gu) ?? []).length, 1);
});

test('employee deactivation revokes refresh tokens in the same transaction', () => {
  assert.match(source, /revokeRefreshTokensInTransaction\(tx/u);
  assert.match(source, /prepareUserSessionRevocation\(/u);
  assert.doesNotMatch(source, /\bconsole\./u);
});

test('EmployeesService exposes the characterised write path', () => {
  assert.equal(typeof EmployeesService.prototype.update, 'function');
});
